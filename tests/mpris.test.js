import GLib from 'gi://GLib';

import {
    emptySnapshot,
    snapshotFromVariants,
    SpotifyMpris,
} from '../mpris.js';

function assertEqual(actual, expected, name) {
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

assertEqual(emptySnapshot(), {
    owner: '',
    title: 'Nothing playing',
    artist: 'Spotify',
    artUrl: '',
    playbackStatus: 'Stopped',
    canGoPrevious: false,
    canGoNext: false,
}, 'empty player snapshot');

const metadata = new GLib.Variant('a{sv}', {
    'xesam:title': new GLib.Variant('s', 'Track'),
    'xesam:artist': new GLib.Variant('as', ['One', 'Two']),
    'mpris:artUrl': new GLib.Variant('s', 'file:///cover.jpg'),
});

assertEqual(snapshotFromVariants(':1.8', {
    Metadata: metadata,
    PlaybackStatus: new GLib.Variant('s', 'Playing'),
    CanGoPrevious: new GLib.Variant('b', true),
    CanGoNext: new GLib.Variant('b', false),
}), {
    owner: ':1.8',
    title: 'Track',
    artist: 'One, Two',
    artUrl: 'file:///cover.jpg',
    playbackStatus: 'Playing',
    canGoPrevious: true,
    canGoNext: false,
}, 'MPRIS variants become a player snapshot');

const player = new SpotifyMpris();
assertEqual(player.snapshot, emptySnapshot(), 'new adapter starts empty');

let raiseCall = null;
player._call = (...args) => {
    raiseCall = args;
};
player.raise();
assertEqual(raiseCall, ['Raise', 'org.mpris.MediaPlayer2'],
    'raising uses the root MPRIS interface');

player.stop();
