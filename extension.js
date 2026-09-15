import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {
    Extension,
    gettext as _,
} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Layout from 'resource:///org/gnome/shell/ui/layout.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {SpotifyMpris} from './mpris.js';
import {
    cornerLayout,
    deriveState,
} from './playerState.js';

const CARD_WIDTH = 360;
const CARD_HEIGHT = 96;

export default class SpotifyCornerPlayerExtension extends Extension {
    enable() {
        this._dismissedOwner = '';
        this._shown = false;
        this._pointerTimer = 0;
        this._pressureBarrier = null;
        this._barrier = null;
        this._displaySignals = [];
        this._artUrl = '';
        this._artActor = null;

        this._settings = this.getSettings();
        this._settingsSignal = this._settings.connect('changed',
            (_settings, key) => {
                if (key === 'side')
                    this._onSideChanged();
                else if (key === 'enabled')
                    this._syncState();
            });

        this._buildIndicator();
        this._buildCard();

        for (const [object, signal] of [
            [global.display, 'workareas-changed'],
            [global.display, 'in-fullscreen-changed'],
            [Main.layoutManager, 'monitors-changed'],
        ]) {
            this._displaySignals.push([
                object,
                object.connect(signal, () => this._onDisplayChanged()),
            ]);
        }

        this._mpris = new SpotifyMpris();
        this._mprisSignal = this._mpris.connect(
            'changed', () => this._syncState());
        this._mpris.start();
        this._syncState();
    }

    disable() {
        this._removeTimer('_pointerTimer');
        this._destroyBarrier();

        if (this._mpris) {
            this._mpris.disconnect(this._mprisSignal);
            this._mpris.stop();
        }

        for (const [object, id] of this._displaySignals)
            object.disconnect(id);

        if (this._settings && this._settingsSignal)
            this._settings.disconnect(this._settingsSignal);

        if (this._card) {
            this._card.remove_all_transitions();
            Main.layoutManager.removeChrome(this._card);
            this._card.destroy();
        }
        this._indicator?.destroy();

        this._mpris = null;
        this._mprisSignal = 0;
        this._displaySignals = null;
        this._settings = null;
        this._card = null;
        this._indicator = null;
        this._switchItem = null;
        this._leftSideItem = null;
        this._rightSideItem = null;
        this._exitItem = null;
        this._artActor = null;
        this._artBin = null;
        this._title = null;
        this._artist = null;
        this._previousButton = null;
        this._playButton = null;
        this._nextButton = null;
    }

    _buildIndicator() {
        this._indicator = new PanelMenu.Button(
            0.5, this.metadata.name, false);
        this._indicator.add_style_class_name('spotify-corner-indicator');
        const indicatorIcon = new St.Icon({
            icon_name: 'media-playback-start-symbolic',
            style_class: 'system-status-icon spotify-corner-indicator-icon',
        });
        this._indicator.add_child(indicatorIcon);

        const menu = new PopupMenu.PopupMenu(
            indicatorIcon, 0.5, St.Side.TOP);
        menu.focusActor = this._indicator;
        this._indicator.setMenu(menu);

        this._switchItem = new PopupMenu.PopupSwitchMenuItem(
            _('Widget enabled'), this._settings.get_boolean('enabled'));
        this._switchItem.connect('toggled', (_item, active) => {
            if (active)
                this._dismissedOwner = '';
            this._settings.set_boolean('enabled', active);
            this._syncState();
        });
        this._indicator.menu.addMenuItem(this._switchItem);

        const sideMenu = new PopupMenu.PopupSubMenuMenuItem(_('Screen side'));
        this._leftSideItem = new PopupMenu.PopupMenuItem(_('Left'));
        this._leftSideItem.connect('activate', () =>
            this._settings.set_string('side', 'left'));
        sideMenu.menu.addMenuItem(this._leftSideItem);
        this._rightSideItem = new PopupMenu.PopupMenuItem(_('Right'));
        this._rightSideItem.connect('activate', () =>
            this._settings.set_string('side', 'right'));
        sideMenu.menu.addMenuItem(this._rightSideItem);
        this._indicator.menu.addMenuItem(sideMenu);
        this._updateSideMenu();

        this._exitItem = new PopupMenu.PopupMenuItem(_('Exit'));
        this._exitItem.connect('activate', () => {
            const {owner} = this._mpris.snapshot;
            if (owner) {
                this._dismissedOwner = owner;
                this._syncState();
            }
        });
        this._indicator.menu.addMenuItem(this._exitItem);

        Main.panel.addToStatusArea(this.uuid, this._indicator);
        this._indicator.hide();
    }

    _buildCard() {
        this._card = new St.BoxLayout({
            style_class: 'popup-menu-content media-message spotify-corner-player',
            reactive: false,
            track_hover: true,
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            opacity: 0,
            translation_x: this._layout()?.hiddenX ?? -(CARD_WIDTH + 24),
        });

        this._artBin = new St.Button({
            style_class: 'message-icon spotify-corner-art',
            width: 64,
            height: 64,
            clip_to_allocation: true,
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: _('Open Spotify'),
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._artBin.connect('clicked', () => this._mpris.raise());
        this._card.add_child(this._artBin);
        this._setArtwork('');

        const copy = new St.BoxLayout({
            style_class: 'spotify-corner-copy',
            vertical: true,
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._title = new St.Label({
            style_class: 'spotify-corner-title',
            text: _('Nothing playing'),
            x_expand: true,
        });
        this._artist = new St.Label({
            style_class: 'spotify-corner-artist',
            text: 'Spotify',
            x_expand: true,
        });
        for (const label of [this._title, this._artist]) {
            label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
            label.clutter_text.single_line_mode = true;
            copy.add_child(label);
        }
        this._card.add_child(copy);

        const controls = new St.BoxLayout({
            style_class: 'spotify-corner-controls',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._previousButton = this._makeButton(
            'media-skip-backward-symbolic', _('Previous track'),
            () => this._mpris.previous());
        this._playButton = this._makeButton(
            'media-playback-start-symbolic', _('Play or pause'),
            () => this._mpris.playPause());
        this._nextButton = this._makeButton(
            'media-skip-forward-symbolic', _('Next track'),
            () => this._mpris.next());
        controls.add_child(this._previousButton);
        controls.add_child(this._playButton);
        controls.add_child(this._nextButton);
        this._card.add_child(controls);

        Main.layoutManager.addChrome(this._card, {
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._positionCard();
    }

    _makeButton(iconName, accessibleName, callback) {
        const icon = new St.Icon({icon_name: iconName});
        const button = new St.Button({
            style_class: 'message-media-control spotify-corner-button',
            child: icon,
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_name: accessibleName,
        });
        button.connect('clicked', callback);
        button._icon = icon;
        return button;
    }

    _syncState() {
        if (!this._mpris)
            return;

        const snapshot = this._mpris.snapshot;
        const enabled = this._settings.get_boolean('enabled');
        const state = deriveState({
            enabled,
            owner: snapshot.owner,
            dismissedOwner: this._dismissedOwner,
        });

        this._indicator.visible = Boolean(snapshot.owner);
        this._switchItem.setToggleState(
            enabled && state !== 'dismissed');
        this._exitItem.setSensitive(state === 'available');
        this._updateCard(snapshot);

        if (state !== 'available' || this._isFullscreen()) {
            this._destroyBarrier();
            this._hide(true);
        } else if (!this._shown) {
            this._ensureBarrier();
        }
    }

    _updateCard(snapshot) {
        this._title.text = snapshot.title === 'Nothing playing'
            ? _('Nothing playing')
            : snapshot.title;
        this._artist.text = snapshot.artist;
        this._previousButton.reactive = snapshot.canGoPrevious;
        this._previousButton.can_focus = snapshot.canGoPrevious;
        this._nextButton.reactive = snapshot.canGoNext;
        this._nextButton.can_focus = snapshot.canGoNext;
        this._playButton._icon.icon_name = snapshot.playbackStatus === 'Playing'
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._setArtwork(snapshot.artUrl);
    }

    _setArtwork(artUrl) {
        if (artUrl === this._artUrl && this._artActor)
            return;

        this._artUrl = artUrl;
        this._artActor?.destroy();

        if (artUrl) {
            const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
            this._artActor = St.TextureCache.get_default().load_file_async(
                Gio.File.new_for_uri(artUrl), 64, 64, scale, 1.0);
            this._artActor.set_size(64, 64);
        } else {
            this._artActor = new St.Icon({
                icon_name: 'audio-x-generic-symbolic',
                icon_size: 32,
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        }
        this._artBin.set_child(this._artActor);
    }

    _positionCard() {
        const layout = this._layout();
        if (!layout || !this._card)
            return;
        this._card.set_position(layout.panelX, layout.panelY);
        if (!this._shown)
            this._card.translation_x = layout.hiddenX;
    }

    _side() {
        return this._settings?.get_string('side') === 'right'
            ? 'right'
            : 'left';
    }

    _layout() {
        const monitor = this._primaryMonitor();
        return monitor
            ? cornerLayout(monitor, CARD_WIDTH, CARD_HEIGHT, this._side())
            : null;
    }

    _updateSideMenu() {
        const side = this._side();
        this._leftSideItem?.setOrnament(side === 'left'
            ? PopupMenu.Ornament.DOT
            : PopupMenu.Ornament.NONE);
        this._rightSideItem?.setOrnament(side === 'right'
            ? PopupMenu.Ornament.DOT
            : PopupMenu.Ornament.NONE);
    }

    _onSideChanged() {
        this._updateSideMenu();
        this._destroyBarrier();
        this._hide(true);
        this._positionCard();
        this._syncState();
    }

    _onDisplayChanged() {
        this._positionCard();
        this._destroyBarrier();
        if (this._isFullscreen())
            this._hide(true);
        else
            this._syncState();
    }

    _primaryMonitor() {
        return Main.layoutManager.monitors[Main.layoutManager.primaryIndex];
    }

    _isFullscreen() {
        return Boolean(this._primaryMonitor()?.inFullscreen);
    }

    _ensureBarrier() {
        if (this._barrier || this._pressureBarrier || this._shown ||
            this._isFullscreen())
            return;

        const layout = this._layout();
        if (!layout)
            return;

        this._pressureBarrier = new Layout.PressureBarrier(
            20,
            250,
            Shell.ActionMode.NORMAL);
        this._pressureBarrier.connect('trigger', () => this._show());
        this._barrier = new Meta.Barrier({
            backend: global.backend,
            x1: layout.barrierX,
            x2: layout.barrierX,
            y1: layout.barrierY1,
            y2: layout.barrierY2,
            directions: this._side() === 'right'
                ? Meta.BarrierDirection.NEGATIVE_X
                : Meta.BarrierDirection.POSITIVE_X,
        });
        this._pressureBarrier.addBarrier(this._barrier);
    }

    _destroyBarrier() {
        if (this._barrier) {
            this._pressureBarrier?.removeBarrier(this._barrier);
            this._barrier.destroy();
            this._barrier = null;
        }
        this._pressureBarrier?.destroy();
        this._pressureBarrier = null;
    }

    _show() {
        if (this._shown || this._isFullscreen())
            return;

        this._destroyBarrier();
        this._shown = true;
        this._card.reactive = true;
        this._card.remove_all_transitions();
        this._card.ease({
            translation_x: 0,
            opacity: 255,
            duration: 180,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._watchPointer();
    }

    _hide(immediate = false) {
        if (!this._shown && this._card?.opacity === 0)
            return;

        this._shown = false;
        this._removeTimer('_pointerTimer');
        this._card?.remove_all_transitions();

        const finish = () => {
            if (!this._card)
                return;
            this._card.reactive = false;
            this._ensureBarrier();
        };

        if (immediate) {
            this._card.translation_x = this._layout()?.hiddenX ?? 0;
            this._card.opacity = 0;
            finish();
        } else {
            this._card.ease({
                translation_x: this._layout()?.hiddenX ?? 0,
                opacity: 0,
                duration: 180,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                onComplete: finish,
            });
        }
    }

    _watchPointer() {
        this._removeTimer('_pointerTimer');
        let outsideSince = 0;

        this._pointerTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, 100, () => {
                if (!this._shown) {
                    this._pointerTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }

                const [x, y] = global.get_pointer();
                const layout = this._layout();
                if (!layout) {
                    this._pointerTimer = 0;
                    return GLib.SOURCE_REMOVE;
                }
                const insideCard =
                    x >= layout.panelX - 4 &&
                    x <= layout.panelX + CARD_WIDTH + 4 &&
                    y >= layout.panelY - 4 &&
                    y <= layout.panelY + CARD_HEIGHT + 4;
                const insideEdge =
                    x >= layout.edgeX1 && x <= layout.edgeX2 &&
                    y >= layout.barrierY1 && y <= layout.barrierY2;

                if (insideCard || insideEdge) {
                    outsideSince = 0;
                } else if (!outsideSince) {
                    outsideSince = GLib.get_monotonic_time();
                } else if (GLib.get_monotonic_time() - outsideSince >= 300000) {
                    this._pointerTimer = 0;
                    this._hide();
                    return GLib.SOURCE_REMOVE;
                }

                return GLib.SOURCE_CONTINUE;
            });
    }

    _removeTimer(name) {
        if (this[name]) {
            GLib.source_remove(this[name]);
            this[name] = 0;
        }
    }
}
