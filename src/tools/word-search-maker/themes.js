/* Built-in themed word lists: common, generic words only. Within a list no word hides
   inside another (forwards or backwards), so each word is found exactly once. */
(function (root) {
  var THEMES = [
    ['Animals', 'lion, tiger, elephant, giraffe, zebra, monkey, kangaroo, penguin, dolphin, rabbit, squirrel, bear, wolf, fox, owl, turtle, camel, hippo, rhino, panda'],
    ['Fruit', 'apple, banana, orange, grape, mango, peach, pear, plum, cherry, lemon, lime, kiwi, melon, papaya, apricot, coconut, fig, guava, strawberry, blueberry'],
    ['Vegetables', 'carrot, potato, tomato, onion, garlic, pepper, cabbage, lettuce, spinach, broccoli, celery, cucumber, pumpkin, radish, beet, corn, peas, bean, leek, zucchini'],
    ['Space', 'planet, star, moon, sun, comet, galaxy, orbit, rocket, astronaut, asteroid, meteor, nebula, telescope, satellite, gravity, eclipse, crater, universe, launch, cosmos'],
    ['Ocean', 'wave, tide, coral, reef, shark, whale, octopus, squid, crab, lobster, jellyfish, seaweed, shell, starfish, seahorse, current, island, anchor, salt, oyster'],
    ['Weather', 'rain, snow, wind, cloud, storm, thunder, lightning, sunny, fog, hail, sleet, frost, drizzle, tornado, hurricane, breeze, humid, forecast, drought, climate'],
    ['Sports', 'soccer, tennis, golf, hockey, rugby, cricket, baseball, boxing, rowing, skiing, surfing, cycling, swimming, archery, karate, fencing, bowling, sailing, volleyball, badminton'],
    ['In the kitchen', 'spoon, fork, knife, plate, bowl, cup, oven, kettle, toaster, blender, pan, pot, ladle, whisk, spatula, colander, apron, sink, fridge, microwave'],
    ['Garden', 'flower, seed, soil, shovel, rake, hose, weed, rose, tulip, daisy, lavender, hedge, bench, fence, pond, path, compost, worm, bee, trowel'],
    ['On the farm', 'tractor, barn, cow, pig, sheep, goat, horse, chicken, duck, goose, hay, field, farmer, harvest, scarecrow, orchard, stable, wheat, eggs, pony'],
    ['Music', 'piano, guitar, drum, violin, flute, trumpet, harp, cello, clarinet, tuba, banjo, organ, rhythm, melody, chord, tempo, choir, concert, lyrics, song'],
    ['Getting around', 'car, bus, train, plane, bicycle, truck, boat, ship, taxi, scooter, tram, ferry, helicopter, motorbike, van, canoe, ambulance, wagon, yacht, skateboard'],
    ['The human body', 'head, shoulder, knee, elbow, ankle, wrist, finger, thumb, heart, lungs, brain, stomach, skeleton, muscle, nose, chin, eye, liver, spine, tooth'],
    ['Colors', 'red, blue, green, yellow, orange, purple, pink, brown, black, white, gray, violet, indigo, teal, maroon, navy, beige, coral, ivory, turquoise'],
    ['At school', 'pencil, eraser, ruler, notebook, backpack, teacher, desk, chalk, library, lesson, homework, science, history, math, spelling, recess, classroom, crayon, glue, scissors'],
    ['Camping', 'tent, campfire, lantern, flashlight, backpack, compass, map, trail, hiking, cabin, sleeping bag, marshmallow, canoe, forest, river, lake, mountain, pinecone, binoculars, firewood'],
    ['Winter', 'snowman, scarf, mittens, sled, icicle, blizzard, fireplace, cocoa, boots, jacket, skates, snowflake, sweater, igloo, penguin, frozen, chilly, hat, slippers, blanket']
  ].map(function (t) { return { title: t[0], words: t[1].split(/\s*,\s*/) }; });
  if (typeof module !== 'undefined' && module.exports) module.exports = THEMES;
  else root.WS_THEMES = THEMES;
})(typeof self !== 'undefined' ? self : this);
