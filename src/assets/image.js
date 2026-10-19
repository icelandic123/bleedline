/* Bleedline image core, shared by the image tools (DPI checker, POD resizer, PNG trimmer).
   - Reads the print resolution stored in PNG, JPEG, TIFF and WebP files.
   - Rewrites it in place (PNG pHYs, JPEG JFIF/EXIF/Photoshop, TIFF tags) without touching image data.
   - Decodes and encodes PNG exactly (fflate), so alpha edges are never altered by canvas premultiplication.
   - Resamples big images in strips with a bicubic filter in premultiplied alpha.
   Exposes BL.img. Works in the browser and, for tests, in Node (pass fflate via BL.img.useFflate). */
(function (root) {
  var BL = root.BL || (root.BL = {});
  var I = BL.img = {};
  var M_PER_IN = 0.0254;

  /* ---------- bytes ---------- */
  function u16be(b, p) { return (b[p] << 8) | b[p + 1]; }
  function u32be(b, p) { return ((b[p] << 24) >>> 0) + ((b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]); }
  function u16le(b, p) { return b[p] | (b[p + 1] << 8); }
  function u32le(b, p) { return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16)) + ((b[p + 3] << 24) >>> 0); }
  function u24le(b, p) { return b[p] | (b[p + 1] << 8) | (b[p + 2] << 16); }
  function str(b, p, n) { var s = ''; for (var i = 0; i < n && p + i < b.length; i++) s += String.fromCharCode(b[p + i]); return s; }
  function put32be(b, p, v) { b[p] = v >>> 24 & 255; b[p + 1] = v >>> 16 & 255; b[p + 2] = v >>> 8 & 255; b[p + 3] = v & 255; }
  function put16be(b, p, v) { b[p] = v >>> 8 & 255; b[p + 1] = v & 255; }
  function concat(parts) {
    var n = 0, i; for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n), p = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], p); p += parts[i].length; }
    return out;
  }
  I.concat = concat;

  var crcTable = null;
  function crc32(buf, start, end) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    var crc = 0xffffffff;
    for (var i = start || 0, e = end === undefined ? buf.length : end; i < e; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  I.crc32 = crc32;

  I.sniff = function (b) {
    if (b.length < 12) return null;
    if (b[0] === 0x89 && str(b, 1, 3) === 'PNG') return 'png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WEBP') return 'webp';
    if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42)) return 'tiff';
    if (str(b, 0, 4) === 'GIF8') return 'gif';
    if (str(b, 0, 2) === 'BM') return 'bmp';
    if (str(b, 4, 4) === 'ftyp') { var brand = str(b, 8, 4); if (/hei|hev|mif1|msf1|avif|avis/.test(brand)) return /avi/.test(brand) ? 'avif' : 'heic'; }
    return null;
  };

  function round2(n) { return Math.round(n * 10) / 10; }
  function dpiObj(x, y) { return { x: round2(x), y: round2(y) }; }

  /* ---------- PNG chunks ---------- */
  function pngChunks(b) {
    var out = [], p = 8;
    while (p + 8 <= b.length) {
      var len = u32be(b, p), type = str(b, p + 4, 4);
      if (p + 12 + len > b.length) throw new Error('This PNG file is cut short. It may be damaged or still downloading.');
      out.push({ type: type, start: p, len: len, data: p + 8, end: p + 12 + len });
      p += 12 + len;
      if (type === 'IEND') break;
    }
    if (!out.length || out[0].type !== 'IHDR') throw new Error('This PNG file is damaged (no IHDR header).');
    return out;
  }
  I.pngChunks = pngChunks;
  function pngChunk(type, data) {
    var out = new Uint8Array(12 + data.length);
    put32be(out, 0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    put32be(out, 8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  }
  I.pngChunk = pngChunk;
  function physChunk(dpi) {
    var ppm = Math.round(dpi / M_PER_IN), d = new Uint8Array(9);
    put32be(d, 0, ppm); put32be(d, 4, ppm); d[8] = 1;
    return pngChunk('pHYs', d);
  }
  I.physChunk = physChunk;

  /* ---------- TIFF / EXIF ---------- */
  var TT = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  // Parse IFD0 of a TIFF structure starting at `base` in b. Returns {le, entries: {tag: {type, count, valueOff}}}
  function tiffIfd0(b, base, end) {
    end = end || b.length;
    if (base + 8 > end) return null;
    var le = b[base] === 0x49;
    if (!(le || b[base] === 0x4d) || b[base] !== b[base + 1]) return null;
    var r16 = le ? function (p) { return u16le(b, base + p); } : function (p) { return u16be(b, base + p); };
    var r32 = le ? function (p) { return u32le(b, base + p); } : function (p) { return u32be(b, base + p); };
    if (r16(2) !== 42) return null;
    var ifd = r32(4);
    if (base + ifd + 2 > end) return null;
    var n = r16(ifd), entries = {};
    if (n > 1000 || base + ifd + 2 + n * 12 > end) return null;
    for (var i = 0; i < n; i++) {
      var e = ifd + 2 + i * 12, tag = r16(e), type = r16(e + 2), count = r32(e + 4);
      var size = (TT[type] || 1) * count;
      var valueOff = size <= 4 ? e + 8 : r32(e + 8);
      if (base + valueOff + size > end) continue;
      entries[tag] = { type: type, count: count, valueOff: valueOff, entryOff: e };
    }
    return { le: le, entries: entries, r16: r16, r32: r32, base: base };
  }
  function tiffValue(t, tag) {
    var e = t.entries[tag]; if (!e) return null;
    if (e.type === 3) return t.r16(e.valueOff);
    if (e.type === 4) return t.r32(e.valueOff);
    if (e.type === 5 || e.type === 10) { var d = t.r32(e.valueOff + 4); return d ? t.r32(e.valueOff) / d : null; }
    if (e.type === 1) return t.r16(e.valueOff) >> 8;
    return null;
  }
  // Resolution in DPI from TIFF/EXIF tags, or null when no absolute unit is stored.
  function tiffDpi(t) {
    var xr = tiffValue(t, 282), yr = tiffValue(t, 283);
    if (!xr) return null;
    var unit = tiffValue(t, 296); if (unit === null) unit = 2;
    var f = unit === 2 ? 1 : unit === 3 ? 2.54 : 0;
    if (!f) return { none: true, raw: xr };
    return dpiObj(xr * f, (yr || xr) * f);
  }
  // Patch resolution tags in place. Returns the number of tags changed.
  function tiffSetDpi(b, t, dpi) {
    var changed = 0, le = t.le, base = t.base;
    var num = Math.round(dpi) === dpi ? dpi : Math.round(dpi * 1000), den = Math.round(dpi) === dpi ? 1 : 1000;
    function w32(p, v) { p += base; if (le) { b[p] = v & 255; b[p + 1] = v >>> 8 & 255; b[p + 2] = v >>> 16 & 255; b[p + 3] = v >>> 24 & 255; } else put32be(b, p, v); }
    function w16(p, v) { p += base; if (le) { b[p] = v & 255; b[p + 1] = v >>> 8 & 255; } else put16be(b, p, v); }
    [282, 283].forEach(function (tag) {
      var e = t.entries[tag];
      if (e && (e.type === 5 || e.type === 10)) { w32(e.valueOff, num); w32(e.valueOff + 4, den); changed++; }
    });
    var u = t.entries[296];
    if (u && u.type === 3) { w16(u.valueOff, 2); changed++; }
    return changed;
  }

  /* ---------- JPEG segments ---------- */
  function jpegSegments(b) {
    var segs = [], p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) throw new Error('This JPEG file is damaged (unexpected data at byte ' + p + ').');
      var m = b[p + 1];
      if (m === 0xff) { p++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { p += 2; continue; }
      if (m === 0xd9) break;
      var len = u16be(b, p + 2);
      if (len < 2 || p + 2 + len > b.length) throw new Error('This JPEG file is cut short or damaged.');
      segs.push({ marker: m, start: p, data: p + 4, end: p + 2 + len });
      if (m === 0xda) break; // start of scan: the rest is image data
      p += 2 + len;
    }
    return segs;
  }
  I.jpegSegments = jpegSegments;
  function isSOF(m) { return m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc; }
  // Photoshop image resources: find ResolutionInfo (0x03ED). Returns offset of its data or -1.
  function psResolutionOffset(b, start, end) {
    var p = start;
    while (p + 12 <= end) {
      if (str(b, p, 4) !== '8BIM') return -1;
      var id = u16be(b, p + 4), nameLen = b[p + 6], q = p + 6 + 1 + nameLen;
      if ((1 + nameLen) % 2) q++;
      var size = u32be(b, q); q += 4;
      if (id === 0x03ed && size >= 16 && q + 16 <= end) return q;
      p = q + size + (size % 2);
    }
    return -1;
  }

  /* ---------- read info ---------- */
  // Returns {format, width, height, orientation, entries:[{where, dpi|null, text}], dpi (best guess or null),
  //          mode, bitDepth, hasAlpha, icc, canRewrite, notes[]}
  I.readInfo = function (b) {
    var fmt = I.sniff(b);
    var info = { format: fmt, width: 0, height: 0, orientation: 1, entries: [], dpi: null, mode: '', bitDepth: 0, hasAlpha: null, icc: false, canRewrite: false, notes: [] };
    if (fmt === 'png') readPng(b, info);
    else if (fmt === 'jpeg') readJpeg(b, info);
    else if (fmt === 'tiff') readTiff(b, info);
    else if (fmt === 'webp') readWebp(b, info);
    else if (fmt === 'heic' || fmt === 'avif') throw new Error((fmt === 'heic' ? 'HEIC (iPhone photo)' : 'AVIF') + ' files are not supported here. Export the image as PNG or JPEG first. On an iPhone, set Camera > Formats to Most Compatible, or share the photo as JPEG.');
    else if (fmt === 'gif') throw new Error('GIF files can hold only 256 colors and are not used for print. Save the image as PNG instead.');
    else if (fmt === 'bmp') throw new Error('BMP files are not supported. Save the image as PNG or JPEG.');
    else throw new Error('This does not look like a PNG, JPEG, WebP or TIFF image.');
    var good = info.entries.filter(function (e) { return e.dpi; });
    if (good.length) {
      info.dpi = good[0].dpi;
      var differ = good.some(function (e) { return Math.abs(e.dpi.x - good[0].dpi.x) > 0.5 || Math.abs(e.dpi.y - good[0].dpi.y) > 0.5; });
      if (differ) info.notes.push('mixed');
    }
    info.displayWidth = info.orientation >= 5 ? info.height : info.width;
    info.displayHeight = info.orientation >= 5 ? info.width : info.height;
    return info;
  };

  function readPng(b, info) {
    var ch = pngChunks(b), ih = ch[0].data;
    info.width = u32be(b, ih); info.height = u32be(b, ih + 4);
    info.bitDepth = b[ih + 8]; var ct = b[ih + 9];
    info.colorType = ct; info.interlaced = b[ih + 12] === 1;
    info.mode = { 0: 'Grayscale', 2: 'RGB', 3: 'Indexed color (palette)', 4: 'Grayscale + alpha', 6: 'RGB + alpha' }[ct] || 'Unknown';
    info.hasAlpha = ct === 4 || ct === 6;
    info.canRewrite = true;
    var phys = false;
    ch.forEach(function (c) {
      if (c.type === 'tRNS') info.hasAlpha = true;
      if (c.type === 'iCCP' || c.type === 'sRGB') info.icc = true;
      if (c.type === 'acTL') info.notes.push('animated');
      if (c.type === 'pHYs' && c.len >= 9) {
        phys = true;
        var x = u32be(b, c.data), y = u32be(b, c.data + 4), unit = b[c.data + 8];
        if (unit === 1) info.entries.push({ where: 'PNG pHYs chunk', dpi: dpiObj(x * M_PER_IN, y * M_PER_IN) });
        else info.entries.push({ where: 'PNG pHYs chunk', dpi: null, text: 'Pixel aspect ratio only (' + x + ':' + y + '), no DPI' });
      }
      if (c.type === 'eXIf') {
        var t = tiffIfd0(b, c.data, c.data + c.len);
        var d = t && tiffDpi(t);
        if (d) info.entries.push(d.none ? { where: 'PNG EXIF', dpi: null, text: 'No unit stored' } : { where: 'PNG EXIF', dpi: d });
      }
    });
    if (!phys) info.entries.unshift({ where: 'PNG pHYs chunk', dpi: null, text: 'Not present' });
  }

  function readJpeg(b, info) {
    var segs = jpegSegments(b), sawJfif = false;
    info.canRewrite = true;
    segs.forEach(function (s) {
      var m = s.marker;
      if (isSOF(m)) {
        info.bitDepth = b[s.data]; info.height = u16be(b, s.data + 1); info.width = u16be(b, s.data + 3);
        var comps = b[s.data + 5];
        info.mode = comps === 1 ? 'Grayscale' : comps === 3 ? 'RGB (YCbCr)' : comps === 4 ? 'CMYK' : comps + ' channels';
        info.cmyk = comps === 4;
        info.progressive = m === 0xc2;
      }
      if (m === 0xe0 && str(b, s.data, 5) === 'JFIF\0') {
        sawJfif = true;
        var units = b[s.data + 7], x = u16be(b, s.data + 8), y = u16be(b, s.data + 10);
        if (units === 1) info.entries.push({ where: 'JFIF header', dpi: dpiObj(x, y) });
        else if (units === 2) info.entries.push({ where: 'JFIF header', dpi: dpiObj(x * 2.54, y * 2.54) });
        else info.entries.push({ where: 'JFIF header', dpi: null, text: 'Aspect ratio only (' + x + ':' + y + '), no DPI' });
      }
      if (m === 0xe1 && str(b, s.data, 6) === 'Exif\0\0') {
        var t = tiffIfd0(b, s.data + 6, s.end);
        if (t) {
          var o = tiffValue(t, 274); if (o >= 1 && o <= 8) info.orientation = o;
          var d = tiffDpi(t);
          if (d) info.entries.push(d.none ? { where: 'EXIF', dpi: null, text: 'Resolution ' + round2(d.raw) + ' with no unit' } : { where: 'EXIF', dpi: d });
        }
      }
      if (m === 0xe2 && str(b, s.data, 12) === 'ICC_PROFILE\0') info.icc = true;
      if (m === 0xed && str(b, s.data, 14) === 'Photoshop 3.0\0') {
        var q = psResolutionOffset(b, s.data + 14, s.end);
        if (q > 0) {
          var hr = u32be(b, q) / 65536, hu = u16be(b, q + 4), vr = u32be(b, q + 8) / 65536;
          var f = hu === 2 ? 2.54 : 1;
          info.entries.push({ where: 'Photoshop resolution', dpi: dpiObj(hr * f, vr * f) });
        }
      }
    });
    if (!sawJfif) info.entries.unshift({ where: 'JFIF header', dpi: null, text: 'Not present' });
    if (!info.width) throw new Error('Could not find the image size in this JPEG. The file may be damaged.');
    info.hasAlpha = false;
  }

  function readTiff(b, info) {
    var t = tiffIfd0(b, 0);
    if (!t) throw new Error('This TIFF file could not be read.');
    info.width = tiffValue(t, 256); info.height = tiffValue(t, 257);
    var spp = tiffValue(t, 277) || 1, photo = tiffValue(t, 262);
    info.bitDepth = tiffValue(t, 258) || 8;
    info.mode = photo === 5 ? 'CMYK' : photo === 2 ? (spp > 3 ? 'RGB + alpha' : 'RGB') : photo === 3 ? 'Indexed color' : photo <= 1 ? 'Grayscale' : 'Other';
    info.cmyk = photo === 5;
    info.hasAlpha = (photo === 2 && spp > 3) || !!t.entries[338];
    var o = tiffValue(t, 274); if (o >= 1 && o <= 8) info.orientation = o;
    info.icc = !!t.entries[34675];
    var d = tiffDpi(t);
    info.entries.push(d ? (d.none ? { where: 'TIFF tags', dpi: null, text: 'No unit stored' } : { where: 'TIFF tags', dpi: d }) : { where: 'TIFF tags', dpi: null, text: 'Not present' });
    info.canRewrite = !!(t.entries[282] && t.entries[283] && (t.entries[282].type === 5 || t.entries[282].type === 10));
    info.noPreview = true;
  }

  function readWebp(b, info) {
    var p = 12;
    info.mode = 'RGB'; info.hasAlpha = false;
    while (p + 8 <= b.length) {
      var id = str(b, p, 4), size = u32le(b, p + 4), d = p + 8;
      if (id === 'VP8X') { info.width = u24le(b, d + 4) + 1; info.height = u24le(b, d + 7) + 1; info.hasAlpha = !!(b[d] & 0x10); info.icc = !!(b[d] & 0x20); }
      else if (id === 'VP8 ' && !info.width) { info.width = u16le(b, d + 6) & 0x3fff; info.height = u16le(b, d + 8) & 0x3fff; }
      else if (id === 'VP8L' && !info.width) { var v = u32le(b, d + 1); info.width = (v & 0x3fff) + 1; info.height = ((v >>> 14) & 0x3fff) + 1; info.hasAlpha = !!((v >>> 28) & 1); }
      else if (id === 'EXIF') {
        var base = str(b, d, 6) === 'Exif\0\0' ? d + 6 : d;
        var t = tiffIfd0(b, base, d + size), dd = t && tiffDpi(t);
        if (dd && !dd.none) info.entries.push({ where: 'WebP EXIF', dpi: dd });
        var o = t && tiffValue(t, 274); if (o >= 1 && o <= 8) info.orientation = o;
      }
      p = d + size + (size % 2);
    }
    if (info.hasAlpha) info.mode = 'RGB + alpha';
    if (!info.entries.length) info.entries.push({ where: 'WebP file', dpi: null, text: 'WebP has no DPI field' });
    info.canRewrite = false;
  }

  /* ---------- write DPI (no re-encoding) ---------- */
  // Returns {bytes, changed: [where...], inserted: bool}
  I.setDpi = function (b, dpi) {
    if (!(dpi > 0 && dpi <= 65535)) throw new Error('Enter a DPI between 1 and 65535.');
    var fmt = I.sniff(b);
    if (fmt === 'png') return setPngDpi(b, dpi);
    if (fmt === 'jpeg') return setJpegDpi(b, dpi);
    if (fmt === 'tiff') return setTiffDpi(b, dpi);
    throw new Error('Only PNG, JPEG and TIFF files can have their DPI changed without re-saving the image.');
  };

  function setPngDpi(b, dpi) {
    var ch = pngChunks(b), parts = [b.subarray(0, 8)], changed = ['PNG pHYs chunk'];
    ch.forEach(function (c, i) {
      if (c.type === 'pHYs') return; // replaced
      if (c.type === 'eXIf') {
        var copy = b.slice(c.start, c.end), t = tiffIfd0(copy, 8, 8 + c.len);
        if (t && tiffSetDpi(copy, t, dpi)) { put32be(copy, 8 + c.len, crc32(copy, 4, 8 + c.len)); changed.push('PNG EXIF'); }
        parts.push(copy);
      } else parts.push(b.subarray(c.start, c.end));
      if (i === 0) parts.push(physChunk(dpi));
    });
    var last = ch[ch.length - 1];
    if (last.end < b.length) parts.push(b.subarray(last.end)); // keep any trailing bytes as they were
    return { bytes: concat(parts), changed: changed };
  }

  function jfifSegment(dpi) {
    var d = Math.round(dpi), s = new Uint8Array(18);
    s.set([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1]);
    put16be(s, 12, d); put16be(s, 14, d); s[16] = 0; s[17] = 0;
    return s;
  }
  function setJpegDpi(b, dpi) {
    var out = b.slice(), segs = jpegSegments(b), changed = [], hasJfif = false, d = Math.round(dpi);
    segs.forEach(function (s) {
      if (s.marker === 0xe0 && str(b, s.data, 5) === 'JFIF\0' && s.end - s.data >= 12) {
        hasJfif = true; out[s.data + 7] = 1; put16be(out, s.data + 8, d); put16be(out, s.data + 10, d); changed.push('JFIF header');
      }
      if (s.marker === 0xe1 && str(b, s.data, 6) === 'Exif\0\0') {
        var t = tiffIfd0(out, s.data + 6, s.end);
        if (t && tiffSetDpi(out, t, dpi)) changed.push('EXIF');
      }
      if (s.marker === 0xed && str(b, s.data, 14) === 'Photoshop 3.0\0') {
        var q = psResolutionOffset(out, s.data + 14, s.end);
        if (q > 0) {
          var fx = Math.round(dpi * 65536);
          put32be(out, q, fx); put16be(out, q + 4, 1); put32be(out, q + 8, fx); put16be(out, q + 12, 1);
          changed.push('Photoshop resolution');
        }
      }
    });
    if (!hasJfif) {
      changed.unshift('JFIF header (added)');
      out = concat([out.subarray(0, 2), jfifSegment(dpi), out.subarray(2)]);
    }
    return { bytes: out, changed: changed, inserted: !hasJfif };
  }

  function setTiffDpi(b, dpi) {
    var out = b.slice(), t = tiffIfd0(out, 0);
    if (!t || !tiffSetDpi(out, t, dpi)) throw new Error('This TIFF has no resolution tags to update. Re-save it from your design app with a resolution set.');
    return { bytes: out, changed: ['TIFF tags'] };
  }

  // Check that the compressed image data is byte-for-byte the same in both files.
  I.sameImageData = function (a, b) {
    var fmt = I.sniff(a);
    if (fmt !== I.sniff(b)) return false;
    if (fmt === 'png') {
      var ca = pngChunks(a).filter(function (c) { return c.type === 'IDAT'; }), cb = pngChunks(b).filter(function (c) { return c.type === 'IDAT'; });
      if (ca.length !== cb.length) return false;
      for (var i = 0; i < ca.length; i++) if (!eqRange(a, ca[i].start, b, cb[i].start, ca[i].end - ca[i].start) || ca[i].len !== cb[i].len) return false;
      return true;
    }
    if (fmt === 'jpeg') {
      var sa = jpegSegments(a), sb = jpegSegments(b);
      var pa = sa[sa.length - 1], pb = sb[sb.length - 1];
      if (pa.marker !== 0xda || pb.marker !== 0xda) return false;
      return a.length - pa.start === b.length - pb.start && eqRange(a, pa.start, b, pb.start, a.length - pa.start);
    }
    if (fmt === 'tiff') {
      if (a.length !== b.length) return false;
      var diff = 0; for (var k = 0; k < a.length; k++) if (a[k] !== b[k] && ++diff > 24) return false;
      return true;
    }
    return false;
  };
  function eqRange(a, pa, b, pb, n) { for (var i = 0; i < n; i++) if (a[pa + i] !== b[pb + i]) return false; return true; }

  /* ---------- fflate ---------- */
  var ff = null;
  I.useFflate = function (f) { ff = f; };
  I.fflate = function () {
    if (ff) return Promise.resolve(ff);
    if (root.fflate) { ff = root.fflate; return Promise.resolve(ff); }
    return BL.loadScript('assets/vendor/fflate.min.js').then(function () { ff = root.fflate; return ff; });
  };

  /* ---------- PNG decode (exact, 8-bit RGBA output) ---------- */
  var ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];
  // Needs fflate loaded (call I.fflate() first). Returns {width, height, data: Uint8Array RGBA, keep: [{type, data}], dpi, info}
  I.decodePng = function (b) {
    if (!ff) throw new Error('PNG decoder not ready.');
    var ch = pngChunks(b), ih = ch[0].data;
    var w = u32be(b, ih), h = u32be(b, ih + 4), bd = b[ih + 8], ct = b[ih + 9], il = b[ih + 12];
    if ([0, 2, 3, 4, 6].indexOf(ct) < 0 || [1, 2, 4, 8, 16].indexOf(bd) < 0) throw new Error('Unsupported PNG type.');
    if (w * h > 400e6) throw new Error('This PNG is ' + w + ' × ' + h + ' pixels, too large to process in a browser.');
    var nch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
    var pal = null, trns = null, idats = [], keep = [], dpi = null;
    ch.forEach(function (c) {
      var data = b.subarray(c.data, c.data + c.len);
      if (c.type === 'PLTE') pal = data;
      else if (c.type === 'tRNS') trns = data;
      else if (c.type === 'IDAT') idats.push(data);
      else if (c.type === 'pHYs' && data[8] === 1) dpi = u32be(data, 0) * M_PER_IN;
      if (['iCCP', 'sRGB', 'gAMA', 'cHRM'].indexOf(c.type) >= 0) keep.push({ type: c.type, data: data.slice() });
    });
    if (ct === 3 && !pal) throw new Error('This palette PNG has no palette.');
    var raw = ff.unzlibSync(concat(idats));
    var out = new Uint8Array(w * h * 4);
    var bpp = Math.max(1, (nch * bd) >> 3);
    var passes = il ? ADAM7 : [[0, 0, 1, 1]];
    var pos = 0, maxv = (1 << bd) - 1;
    var tr = trns && ct === 0 ? u16be(trns, 0) : -1;
    var trR = trns && ct === 2 ? u16be(trns, 0) : -1, trG = trns && ct === 2 ? u16be(trns, 2) : -1, trB = trns && ct === 2 ? u16be(trns, 4) : -1;
    for (var pi = 0; pi < passes.length; pi++) {
      var ps = passes[pi], pw = Math.ceil((w - ps[0]) / ps[2]), ph = Math.ceil((h - ps[1]) / ps[3]);
      if (pw <= 0 || ph <= 0) continue;
      var rb = Math.ceil(pw * nch * bd / 8);
      var prev = new Uint8Array(rb), cur = new Uint8Array(rb);
      for (var y = 0; y < ph; y++) {
        if (pos + 1 + rb > raw.length) throw new Error('This PNG file is damaged (image data is too short).');
        var ft = raw[pos++];
        cur.set(raw.subarray(pos, pos + rb)); pos += rb;
        unfilter(ft, cur, prev, bpp);
        var oy = ps[1] + y * ps[3];
        for (var x = 0; x < pw; x++) {
          var o = ((oy * w) + ps[0] + x * ps[2]) * 4, r, g, bl, a = 255, v;
          if (bd === 8) {
            var q = x * nch;
            if (ct === 6) { r = cur[q]; g = cur[q + 1]; bl = cur[q + 2]; a = cur[q + 3]; }
            else if (ct === 2) { r = cur[q]; g = cur[q + 1]; bl = cur[q + 2]; if (r === trR && g === trG && bl === trB) a = 0; }
            else if (ct === 0) { r = g = bl = cur[q]; if (r === tr) a = 0; }
            else if (ct === 4) { r = g = bl = cur[q]; a = cur[q + 1]; }
            else { v = cur[q]; r = pal[v * 3]; g = pal[v * 3 + 1]; bl = pal[v * 3 + 2]; a = trns && v < trns.length ? trns[v] : 255; }
          } else if (bd === 16) {
            var q2 = x * nch * 2;
            var s0 = (cur[q2] << 8) | cur[q2 + 1];
            if (ct === 6 || ct === 2) {
              var s1 = (cur[q2 + 2] << 8) | cur[q2 + 3], s2 = (cur[q2 + 4] << 8) | cur[q2 + 5];
              r = d16(s0); g = d16(s1); bl = d16(s2);
              if (ct === 6) a = d16((cur[q2 + 6] << 8) | cur[q2 + 7]); else if (s0 === trR && s1 === trG && s2 === trB) a = 0;
            } else { r = g = bl = d16(s0); if (ct === 4) a = d16((cur[q2 + 2] << 8) | cur[q2 + 3]); else if (s0 === tr) a = 0; }
          } else {
            var bit = x * bd; v = (cur[bit >> 3] >> (8 - bd - (bit & 7))) & maxv;
            if (ct === 3) { r = pal[v * 3]; g = pal[v * 3 + 1]; bl = pal[v * 3 + 2]; a = trns && v < trns.length ? trns[v] : 255; }
            else { r = g = bl = Math.round(v * 255 / maxv); if (v === tr) a = 0; }
          }
          out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = a;
        }
        var t = prev; prev = cur; cur = t;
      }
    }
    return { width: w, height: h, data: out, keep: keep, dpi: dpi, bitDepth: bd, colorType: ct };
  };
  function d16(v) { return (v * 255 + 32767) / 65535 | 0; }
  function unfilter(ft, cur, prev, bpp) {
    var n = cur.length, i;
    if (ft === 0) return;
    if (ft === 1) { for (i = bpp; i < n; i++) cur[i] = cur[i] + cur[i - bpp]; }
    else if (ft === 2) { for (i = 0; i < n; i++) cur[i] = cur[i] + prev[i]; }
    else if (ft === 3) { for (i = 0; i < n; i++) cur[i] = cur[i] + ((i >= bpp ? cur[i - bpp] : 0) + prev[i] >> 1); }
    else if (ft === 4) {
      for (i = 0; i < n; i++) {
        var a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
        var p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[i] = cur[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
    } else throw new Error('This PNG file is damaged (bad filter type ' + ft + ').');
  }

  /* ---------- PNG encode (streaming) ---------- */
  // opts: {width, height, alpha (bool), dpi (number or null), keep: [{type,data}], level}
  // Feed rows with addRows(rgba, nRows) where rgba is width*4 bytes per row. finish() returns a Blob.
  function PngEncoder(opts) {
    if (!ff) throw new Error('PNG encoder not ready.');
    var self = this;
    this.w = opts.width; this.h = opts.height; this.alpha = opts.alpha !== false;
    this.ch = this.alpha ? 4 : 3;
    this.rowBytes = this.w * this.ch;
    this.parts = [];
    var ihdr = new Uint8Array(13);
    put32be(ihdr, 0, this.w); put32be(ihdr, 4, this.h); ihdr[8] = 8; ihdr[9] = this.alpha ? 6 : 2;
    this.parts.push(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk('IHDR', ihdr));
    var order = ['iCCP', 'sRGB', 'gAMA', 'cHRM'];
    (opts.keep || []).slice().sort(function (a, b) { return order.indexOf(a.type) - order.indexOf(b.type); }).forEach(function (c) {
      if (c.type === 'sRGB' && (opts.keep || []).some(function (k) { return k.type === 'iCCP'; })) return; // only one of iCCP/sRGB
      self.parts.push(pngChunk(c.type, c.data));
    });
    if (opts.dpi) this.parts.push(physChunk(opts.dpi));
    var level = opts.level === undefined ? 6 : opts.level;
    this.done = new Promise(function (res, rej) { self._res = res; self._rej = rej; });
    // Compress in a worker when possible so filtering and resampling run alongside deflate.
    if (opts.async !== false && ff.AsyncZlib && typeof Worker !== 'undefined') {
      try {
        this.z = new ff.AsyncZlib({ level: level });
        this.z.ondata = function (err, d, final) {
          if (err) { self._rej(err); return; }
          if (d && d.length) self.parts.push(pngChunk('IDAT', d));
          if (final) self._res();
        };
      } catch (e) { this.z = null; }
    }
    if (!this.z) {
      this.z = new ff.Zlib({ level: level });
      this.z.ondata = function (d, final) { if (d.length) self.parts.push(pngChunk('IDAT', d)); if (final) self._res(); };
    }
    this.prev = new Uint8Array(this.rowBytes);
    this.cur = new Uint8Array(this.rowBytes);
    this.rows = 0;
    this.size = 0;
  }
  PngEncoder.prototype.addRows = function (rgba, nRows) {
    var rb = this.rowBytes, ch = this.ch, w = this.w;
    var buf = new Uint8Array(nRows * (rb + 1));
    for (var y = 0; y < nRows; y++) {
      var src = y * w * 4, cur = this.cur, prev = this.prev, i, x;
      if (ch === 4) cur.set(rgba.subarray(src, src + rb));
      else for (x = 0, i = 0; x < w; x++, i += 3) { cur[i] = rgba[src + x * 4]; cur[i + 1] = rgba[src + x * 4 + 1]; cur[i + 2] = rgba[src + x * 4 + 2]; }
      filterRow(cur, prev, ch, buf, y * (rb + 1));
      this.prev = cur; this.cur = prev;
    }
    this.rows += nRows;
    this.z.push(buf, this.rows >= this.h);
  };
  // Resolves to a Blob once compression has finished.
  PngEncoder.prototype.finish = function () {
    var self = this;
    if (this.rows !== this.h) return Promise.reject(new Error('PNG encoder got ' + this.rows + ' rows, expected ' + this.h + '.'));
    return this.done.then(function () {
      self.parts.push(pngChunk('IEND', new Uint8Array(0)));
      var blob = new Blob(self.parts, { type: 'image/png' });
      self.parts = null;
      return blob;
    });
  };
  I.PngEncoder = PngEncoder;
  // Pick the PNG filter with the smallest sum of absolute values (the usual heuristic), judged on a sample of the row.
  function filterRow(cur, prev, bpp, out, o) {
    var n = cur.length, i, best = 0, step = n > 2048 ? 7 : 1;
    var s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0;
    for (i = bpp; i < n; i += step) {
      var x = cur[i], a = cur[i - bpp], b = prev[i], c = prev[i - bpp];
      var p = a + b - c, pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
      var v = x; s0 += v < 128 ? v : 256 - v;
      v = (x - a) & 255; s1 += v < 128 ? v : 256 - v;
      v = (x - b) & 255; s2 += v < 128 ? v : 256 - v;
      v = (x - ((a + b) >> 1)) & 255; s3 += v < 128 ? v : 256 - v;
      v = (x - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; s4 += v < 128 ? v : 256 - v;
    }
    var sums = [s0, s1, s2, s3, s4], bs = s0;
    for (i = 1; i < 5; i++) if (sums[i] < bs) { bs = sums[i]; best = i; }
    out[o++] = best;
    if (best === 0) { out.set(cur, o); return; }
    if (best === 2) { for (i = 0; i < n; i++) out[o + i] = cur[i] - prev[i]; return; }
    if (best === 1) { for (i = 0; i < bpp; i++) out[o + i] = cur[i]; for (; i < n; i++) out[o + i] = cur[i] - cur[i - bpp]; return; }
    if (best === 3) { for (i = 0; i < bpp; i++) out[o + i] = cur[i] - (prev[i] >> 1); for (; i < n; i++) out[o + i] = cur[i] - ((cur[i - bpp] + prev[i]) >> 1); return; }
    for (i = 0; i < bpp; i++) out[o + i] = cur[i] - prev[i];
    for (; i < n; i++) {
      var a2 = cur[i - bpp], b2 = prev[i], c2 = prev[i - bpp], p2 = a2 + b2 - c2;
      var qa = p2 > a2 ? p2 - a2 : a2 - p2, qb = p2 > b2 ? p2 - b2 : b2 - p2, qc = p2 > c2 ? p2 - c2 : c2 - p2;
      out[o + i] = cur[i] - (qa <= qb && qa <= qc ? a2 : qb <= qc ? b2 : c2);
    }
  }
  // Encode a whole RGBA buffer, yielding between strips. Returns a Promise<Blob>.
  I.encodePng = function (data, w, h, opts, onProgress) {
    opts = opts || {};
    return I.fflate().then(function () {
      var alpha = opts.alpha;
      if (alpha === undefined) { alpha = false; for (var i = 3; i < data.length; i += 4) if (data[i] !== 255) { alpha = true; break; } }
      var enc = new PngEncoder({ width: w, height: h, alpha: alpha, dpi: opts.dpi, keep: opts.keep, level: opts.level });
      var strip = Math.max(1, Math.floor(4e6 / (w * 4))), y = 0;
      return new Promise(function (resolve, reject) {
        (function step() {
          try {
            var n = Math.min(strip, h - y);
            enc.addRows(data.subarray(y * w * 4, (y + n) * w * 4), n); y += n;
            if (onProgress) onProgress(y / h);
            if (y >= h) enc.finish().then(resolve, reject); else setTimeout(step, 0);
          } catch (e) { reject(e); }
        })();
      });
    });
  };

  /* ---------- JPEG density from canvas output ---------- */
  // Canvas JPEGs carry a JFIF header with no DPI. Set it (and nothing else).
  I.jpegWithDpi = function (bytes, dpi) { return setJpegDpi(bytes, dpi).bytes; };

  /* ---------- resampling ---------- */
  function cubic(x) { // Catmull-Rom: sharp, and its only negative lobe sits inside the support, so no faint rings outside alpha edges
    x = x < 0 ? -x : x;
    if (x < 1) return (1.5 * x - 2.5) * x * x + 1;
    if (x < 2) return ((-0.5 * x + 2.5) * x - 4) * x + 2;
    return 0;
  }
  // Contiguous weights for each destination index: start[d], n[d], w[off[d] .. off[d]+n[d]).
  function weights(srcN, dstN) {
    var scale = dstN / srcN, fs = scale < 1 ? 1 / scale : 1, sup = 2 * fs;
    var start = new Int32Array(dstN), cnt = new Int32Array(dstN), off = new Int32Array(dstN), all = [], maxN = 0;
    for (var d = 0; d < dstN; d++) {
      var center = (d + 0.5) / scale;
      var lo = Math.floor(center - sup - 0.5), hi = Math.ceil(center + sup - 0.5);
      var s0 = Math.max(0, lo), s1 = Math.min(srcN - 1, hi), n = s1 - s0 + 1;
      var ws = new Float64Array(n), sum = 0;
      for (var s = lo; s <= hi; s++) {
        var wv = cubic((s + 0.5 - center) / fs);
        if (!wv) continue;
        var si = s < 0 ? 0 : s >= srcN ? srcN - 1 : s;
        ws[si - s0] += wv; sum += wv;
      }
      // trim zero ends
      var a = 0, b = n - 1;
      while (a < b && ws[a] === 0) a++;
      while (b > a && ws[b] === 0) b--;
      start[d] = s0 + a; cnt[d] = b - a + 1; off[d] = all.length;
      for (var k = a; k <= b; k++) all.push(ws[k] / sum);
      if (cnt[d] > maxN) maxN = cnt[d];
    }
    return { start: start, n: cnt, off: off, w: new Float32Array(all), maxN: maxN };
  }
  I._weights = weights;

  /* Resample a source region into a frame.
     opts: srcW, srcH: size of the region getRows returns
           getRows(y0, n): Promise or value, Uint8Array/Uint8ClampedArray RGBA, srcW*4 bytes per row
           dstW, dstH: size the region is scaled to; frameW, frameH: output size; offX, offY: where the scaled region sits
           bg: [r,g,b,a] frame background (a = 0 transparent or 255 opaque)
           onRows(rgba, nRows): receives finished frame rows in order (may return a Promise)
           onProgress(fraction), stripRows (default from size) */
  I.resample = function (o) {
    var srcW = o.srcW, srcH = o.srcH, dstW = o.dstW, dstH = o.dstH, FW = o.frameW, FH = o.frameH;
    var bg = o.bg || [0, 0, 0, 0], opaqueBg = bg[3] === 255;
    var wx = weights(srcW, dstW), wy = weights(srcH, dstH);
    var ringN = wy.maxN + 1, ring = [], ringRow = new Int32Array(ringN).fill(-1);
    for (var r = 0; r < ringN; r++) ring.push(new Float32Array(dstW * 4));
    var pm = new Float32Array(srcW * 4);
    var srcStrip = null, srcY0 = 0, srcN = 0, srcStripRows = Math.max(16, Math.min(256, Math.floor(8e6 / (srcW * 4))));
    var outStrip = o.stripRows || Math.max(1, Math.min(256, Math.floor(8e6 / (FW * 4))));
    var acc = new Float32Array(dstW * 4);
    var lastT = Date.now();

    function srcRow(sy) { // returns a Promise only when a new strip must be fetched
      if (srcStrip && sy >= srcY0 && sy < srcY0 + srcN) return null;
      srcY0 = sy; srcN = Math.min(srcStripRows, srcH - sy);
      return Promise.resolve(o.getRows(srcY0, srcN)).then(function (d) { srcStrip = d; });
    }
    function hpass(sy, outRow) {
      var p = (sy - srcY0) * srcW * 4, s = srcStrip, i, j;
      for (i = 0, j = p; i < srcW * 4; i += 4, j += 4) {
        var a = s[j + 3] / 255;
        pm[i] = s[j] * a; pm[i + 1] = s[j + 1] * a; pm[i + 2] = s[j + 2] * a; pm[i + 3] = s[j + 3];
      }
      var st = wx.start, cn = wx.n, of = wx.off, W = wx.w;
      for (var d = 0, q = 0; d < dstW; d++, q += 4) {
        var r0 = 0, g0 = 0, b0 = 0, a0 = 0, base = st[d] * 4, wo = of[d], n = cn[d];
        for (var k = 0; k < n; k++) {
          var wv = W[wo + k], m = base + k * 4;
          r0 += wv * pm[m]; g0 += wv * pm[m + 1]; b0 += wv * pm[m + 2]; a0 += wv * pm[m + 3];
        }
        outRow[q] = r0; outRow[q + 1] = g0; outRow[q + 2] = b0; outRow[q + 3] = a0;
      }
    }
    function ensureRows(s0, n) { // compute horizontal rows s0..s0+n-1 into the ring, fetching strips as needed
      var chain = null;
      for (var sy = s0; sy < s0 + n; sy++) {
        if (ringRow[sy % ringN] === sy) continue;
        var p = srcRow(sy);
        if (p) return p.then(function () { return ensureRows(s0, n); });
        hpass(sy, ring[sy % ringN]); ringRow[sy % ringN] = sy;
      }
      return chain;
    }
    function contentRow(dy, out, o0) {
      var s0 = wy.start[dy], n = wy.n[dy], wo = wy.off[dy], i, k;
      acc.fill(0);
      for (k = 0; k < n; k++) {
        var wv = wy.w[wo + k], row = ring[(s0 + k) % ringN];
        for (i = 0; i < acc.length; i++) acc[i] += wv * row[i];
      }
      for (i = 0; i < dstW; i++) {
        var q = i * 4, A = acc[q + 3], R = acc[q], G = acc[q + 1], B = acc[q + 2], t = o0 + q;
        if (A > 255) A = 255;
        if (opaqueBg) { // composite over the background
          var inv = A < 0 ? 1 : 1 - A / 255;
          out[t] = clamp(R + bg[0] * inv); out[t + 1] = clamp(G + bg[1] * inv); out[t + 2] = clamp(B + bg[2] * inv); out[t + 3] = 255;
        } else if (A < 0.5) { out[t] = out[t + 1] = out[t + 2] = out[t + 3] = 0; }
        else {
          var f = 255 / A;
          out[t] = clamp(R * f); out[t + 1] = clamp(G * f); out[t + 2] = clamp(B * f); out[t + 3] = A + 0.5 | 0;
        }
      }
    }
    var fy = 0;
    function strip() {
      var n = Math.min(outStrip, FH - fy), buf = new Uint8Array(n * FW * 4), y = 0;
      if (bg[3]) for (var i = 0; i < buf.length; i += 4) { buf[i] = bg[0]; buf[i + 1] = bg[1]; buf[i + 2] = bg[2]; buf[i + 3] = bg[3]; }
      function rowLoop() {
        for (; y < n; y++) {
          var dy = fy + y - o.offY;
          if (dy < 0 || dy >= dstH) continue;
          var p = ensureRows(wy.start[dy], wy.n[dy]);
          if (p) return p.then(rowLoop);
          contentRow(dy, buf, (y * FW + o.offX) * 4);
        }
        return null;
      }
      return Promise.resolve(rowLoop()).then(function () {
        return Promise.resolve(o.onRows(buf, n));
      }).then(function () {
        fy += n;
        if (o.onProgress) o.onProgress(fy / FH);
        if (fy >= FH) return;
        if (Date.now() - lastT > 40 && typeof setTimeout !== 'undefined') { lastT = Date.now(); return new Promise(function (r) { setTimeout(r, 0); }).then(strip); }
        return strip();
      });
    }
    return strip();
  };
  function clamp(v) { return v <= 0 ? 0 : v >= 255 ? 255 : v + 0.5 | 0; }

  /* ---------- canvas helpers ---------- */
  // Can this browser allocate a w × h canvas? Draws a pixel in the far corner and reads it back.
  I.canvasOk = function (w, h) {
    if (typeof document === 'undefined') return true;
    if (w > 32767 || h > 32767) return false;
    try {
      var c = document.createElement('canvas'); c.width = w; c.height = h;
      var ctx = c.getContext('2d'); if (!ctx) return false;
      ctx.fillStyle = '#ff0000'; ctx.fillRect(w - 1, h - 1, 1, 1);
      var ok = ctx.getImageData(w - 1, h - 1, 1, 1).data[0] === 255;
      c.width = c.height = 1;
      return ok;
    } catch (e) { return false; }
  };
  I.canvasLimitText = function (w, h) {
    return 'Your browser could not create a ' + w.toLocaleString() + ' × ' + h.toLocaleString() + ' pixel image (' + (w * h / 1e6).toFixed(1) +
      ' megapixels). Browsers cap the size of an image they can hold in memory: about 268 megapixels on desktop Chrome and Edge, and as little as 16 megapixels on iPhone and iPad Safari. Try a desktop browser, close other tabs, or pick a smaller size.';
  };
  // Row reader over an <img> (or ImageBitmap) region via a strip canvas.
  I.imageRowReader = function (img, sx, sy, sw, sh) {
    var c = document.createElement('canvas'), ctx = null, rows = 0;
    return function (y0, n) {
      if (n > rows || !ctx) {
        rows = Math.max(n, rows); c.width = sw; c.height = rows;
        ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error(I.canvasLimitText(sw, rows));
        ctx.imageSmoothingEnabled = false;
      }
      ctx.clearRect(0, 0, sw, n);
      ctx.drawImage(img, sx, sy + y0, sw, n, 0, 0, sw, n);
      return ctx.getImageData(0, 0, sw, n).data;
    };
  };
  // Row reader over an RGBA buffer (decoded PNG).
  I.bufferRowReader = function (data, fullW, sx, sy, sw) {
    return function (y0, n) {
      if (sx === 0 && sw === fullW) return data.subarray((sy + y0) * fullW * 4, (sy + y0 + n) * fullW * 4);
      var out = new Uint8Array(sw * n * 4);
      for (var y = 0; y < n; y++) { var p = ((sy + y0 + y) * fullW + sx) * 4; out.set(data.subarray(p, p + sw * 4), y * sw * 4); }
      return out;
    };
  };

  I.fmtBytes = function (n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB'; };
  I.baseName = function (name) { return String(name || 'image').replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-') || 'image'; };
  I.sleep = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
})(typeof window !== 'undefined' ? window : globalThis);
