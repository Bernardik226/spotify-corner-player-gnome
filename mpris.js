import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

const PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
const ROOT_INTERFACE = 'org.mpris.MediaPlayer2';

export function emptySnapshot() {
    return {
        owner: '',
        title: 'Nothing playing',
        artist: 'Spotify',
        artUrl: '',
        playbackStatus: 'Stopped',
        canGoPrevious: false,
        canGoNext: false,
    };
}

function unpack(value) {
    return value instanceof GLib.Variant ? value.recursiveUnpack() : value;
}

export function snapshotFromVariants(owner, properties) {
    const metadata = unpack(properties.Metadata) ?? {};
    const title = unpack(metadata['xesam:title']) || 'Nothing playing';
    const artists = unpack(metadata['xesam:artist']) ?? [];

    return {
        owner,
        title,
        artist: artists.length ? artists.join(', ') : 'Spotify',
        artUrl: unpack(metadata['mpris:artUrl']) || '',
        playbackStatus: unpack(properties.PlaybackStatus) || 'Stopped',
        canGoPrevious: Boolean(unpack(properties.CanGoPrevious)),
        canGoNext: Boolean(unpack(properties.CanGoNext)),
    };
}

export const SpotifyMpris = GObject.registerClass({
    Signals: {
        changed: {},
    },
},
class SpotifyMpris extends GObject.Object {
    _init() {
        super._init();
        this._watchId = 0;
        this._proxy = null;
        this._propertiesChangedId = 0;
        this._owner = '';
        this._snapshot = emptySnapshot();
    }

    get snapshot() {
        return {...this._snapshot};
    }

    start() {
        if (this._watchId)
            return;

        this._watchId = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            'org.mpris.MediaPlayer2.spotify',
            Gio.BusNameWatcherFlags.NONE,
            this._onAppeared.bind(this),
            this._onVanished.bind(this));
    }

    playPause() {
        this._call('PlayPause');
    }

    previous() {
        this._call('Previous');
    }

    next() {
        this._call('Next');
    }

    raise() {
        this._call('Raise', ROOT_INTERFACE);
    }

    stop() {
        if (this._watchId) {
            Gio.bus_unwatch_name(this._watchId);
            this._watchId = 0;
        }
        this._dropProxy();
        this._owner = '';
        this._snapshot = emptySnapshot();
    }

    _onAppeared(connection, name, owner) {
        this._dropProxy();
        this._owner = owner;
        this._snapshot = {...emptySnapshot(), owner};
        this.emit('changed');

        Gio.DBusProxy.new(
            connection,
            Gio.DBusProxyFlags.NONE,
            null,
            name,
            '/org/mpris/MediaPlayer2',
            PLAYER_INTERFACE,
            null,
            (_source, result) => {
                if (this._owner !== owner)
                    return;

                try {
                    this._proxy = Gio.DBusProxy.new_finish(result);
                    this._propertiesChangedId = this._proxy.connect(
                        'g-properties-changed', () => this._updateSnapshot());
                    this._updateSnapshot();
                } catch (error) {
                    console.error(`Spotify Corner Player: ${error.message}`);
                }
            });
    }

    _onVanished() {
        if (!this._owner)
            return;

        this._dropProxy();
        this._owner = '';
        this._snapshot = emptySnapshot();
        this.emit('changed');
    }

    _updateSnapshot() {
        if (!this._proxy)
            return;

        const properties = {};
        for (const name of [
            'Metadata',
            'PlaybackStatus',
            'CanGoPrevious',
            'CanGoNext',
        ])
            properties[name] = this._proxy.get_cached_property(name);

        this._snapshot = snapshotFromVariants(this._owner, properties);
        this.emit('changed');
    }

    _call(method, interfaceName = PLAYER_INTERFACE) {
        if (!this._proxy)
            return;

        const connection = this._proxy.get_connection();
        connection.call(
            this._proxy.get_name(),
            this._proxy.get_object_path(),
            interfaceName,
            method,
            null,
            null,
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (source, result) => {
                try {
                    source.call_finish(result);
                } catch (error) {
                    console.error(`Spotify Corner Player: ${error.message}`);
                }
            });
    }

    _dropProxy() {
        if (this._proxy && this._propertiesChangedId)
            this._proxy.disconnect(this._propertiesChangedId);
        this._propertiesChangedId = 0;
        this._proxy = null;
    }
});
