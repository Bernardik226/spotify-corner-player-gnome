import {
    cornerLayout,
    deriveState,
} from '../playerState.js';

function assertEqual(actual, expected, name) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const stateCases = [
    ['no Spotify owner', {enabled: true, owner: '', dismissedOwner: ''}, 'no-player'],
    ['persistent switch wins', {enabled: false, owner: ':1.4', dismissedOwner: ''}, 'disabled'],
    ['dismissed current owner', {enabled: true, owner: ':1.4', dismissedOwner: ':1.4'}, 'dismissed'],
    ['new Spotify owner returns', {enabled: true, owner: ':1.5', dismissedOwner: ':1.4'}, 'available'],
];

for (const [name, input, expected] of stateCases)
    assertEqual(deriveState(input), expected, name);

assertEqual(cornerLayout(
    {x: 100, y: 40, width: 1920, height: 1080},
    360,
    96,
    'left'), {
    panelX: 112,
    panelY: 1012,
    hiddenX: -384,
    barrierX: 100,
    barrierY1: 1036,
    barrierY2: 1108,
    edgeX1: 100,
    edgeX2: 118,
}, 'player sits above the lower-left edge');

assertEqual(cornerLayout(
    {x: 100, y: 40, width: 1920, height: 1080},
    360,
    96,
    'right'), {
    panelX: 1648,
    panelY: 1012,
    hiddenX: 384,
    barrierX: 2019,
    barrierY1: 1036,
    barrierY2: 1108,
    edgeX1: 2002,
    edgeX2: 2020,
}, 'player sits above the lower-right edge');
