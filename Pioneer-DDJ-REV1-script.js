// Pioneer-DDJ-REV1-script.js
// ****************************************************************************
// * Mixxx mapping script file for the Pioneer DDJ-REV1.
// * Authors: Warker, nschloe, dj3730, jusko, tiesjan
// * Reviewers: Be-ing, Holzhaus
// * Manual: https://manual.mixxx.org/2.3/en/hardware/controllers/pioneer_ddj_400.html
// ****************************************************************************
//
//  Implemented (as per manufacturer's manual):
//      * Mixer Section (Faders, EQ, Filter, Gain, Cue)
//      * Browsing and loading + Waveform zoom (shift)
//      * Jogwheels, Scratching, Bending, Loop adjust
//      * Cycle Temporange
//      * Beat Sync
//      * Hot Cue Mode
//      * Beat Loop Mode
//      * Beat Jump Mode
//      * Sampler Mode
//
//  Custom (Mixxx specific mappings):
//      * BeatFX: Assigned Effect Unit 1
//                < LEFT toggles focus between Effects 1, 2 and 3 leftward
//                > RIGHT toggles focus between Effects 1, 2 and 3 rightward
//                v DOWN loads next effect entry for focused Effect
//                SHIFT + v UP loads previous effect entry for focused Effect
//                LEVEL/DEPTH controls the Mix knob of the Effect Unit
//                SHIFT + LEVEL/DEPTH controls the Meta knob of the focused Effect
//                ON/OFF toggles focused effect slot
//                SHIFT + ON/OFF disables all three effect slots.
//      * 32 beat jump forward & back (Shift + </> CUE/LOOP CALL arrows)
//      * Toggle quantize (Shift + channel cue)
//
//  Not implemented (after discussion and trial attempts):
//      * Loop Section:
//        * -4BEAT auto loop (hacky---prefer a clean way to set a 4 beat loop
//                            from a previous position on long press)
//        * CUE/LOOP CALL - memory & delete (complex and not useful. Hot cues are sufficient)
//
//      * Secondary pad modes (trial attempts complex and too experimental)
//        * Keyboard mode
//        * Pad FX1
//        * Pad FX2
//        * Keyshift mode

var PioneerDDJREV1 = {};

PioneerDDJREV1.lights = {
    beatFx: {
        status: 0x94,
        data1: 0x47,
    },
    shiftBeatFx: {
        status: 0x94,
        data1: 0x43,
    },
    deck1: {
        vuMeter: {
            status: 0xB0,
            data1: 0x02,
        },
        playPause: {
            status: 0x90,
            data1: 0x0B,
        },
        shiftPlayPause: {
            status: 0x90,
            data1: 0x47,
        },
        cue: {
            status: 0x90,
            data1: 0x0C,
        },
        shiftCue: {
            status: 0x90,
            data1: 0x48,
        },
    },
    deck2: {
        vuMeter: {
            status: 0xB0,
            data1: 0x02,
        },
        playPause: {
            status: 0x91,
            data1: 0x0B,
        },
        shiftPlayPause: {
            status: 0x91,
            data1: 0x47,
        },
        cue: {
            status: 0x91,
            data1: 0x0C,
        },
        shiftCue: {
            status: 0x91,
            data1: 0x48,
        },
    },
};

//Midi hex for each channel
PioneerDDJREV1.channels = {
    1: 0x90,
    2: 0x91,
    3: 0x92,
    4: 0x93
};

// Store timer IDs
PioneerDDJREV1.timers = {};

// Jog wheel constants
PioneerDDJREV1.vinylMode = [true, true, true, true];
PioneerDDJREV1.alpha = 1.0 / 8;
PioneerDDJREV1.beta = PioneerDDJREV1.alpha / 32;

// Multiplier for fast seek through track using SHIFT+JOGWHEEL
PioneerDDJREV1.fastSeekScale = 150;
PioneerDDJREV1.bendScale = 0.8;

PioneerDDJREV1.tempoRanges = [0.06, 0.10, 0.16, 0.25];

PioneerDDJREV1.shiftButtonDown = [false, false];

// Jog wheel loop adjust
PioneerDDJREV1.loopAdjustIn = [false, false];
PioneerDDJREV1.loopAdjustOut = [false, false];
PioneerDDJREV1.loopAdjustMultiply = 50;

// Beatjump pad (beatjump_size values)
PioneerDDJREV1.beatjumpSizeForPad = {
    0x20: -1, // PAD 1
    0x21: 1,  // PAD 2
    0x22: -2, // PAD 3
    0x23: 2,  // PAD 4
    0x24: -4, // PAD 5
    0x25: 4,  // PAD 6
    0x26: -8, // PAD 7
    0x27: 8   // PAD 8
};

PioneerDDJREV1.quickJumpSize = 32;

// Used for tempo slider
PioneerDDJREV1.highResMSB = {
    "[Channel1]": {},
    "[Channel2]": {}
};

PioneerDDJREV1.trackLoadedLED = function (value, group, _control) {
    midi.sendShortMsg(
        0x9F,
        group.match(script.channelRegEx)[1] - 1,
        value > 0 ? 0x7F : 0x00
    );
};

PioneerDDJREV1.toggleLight = function (midiIn, active) {
    midi.sendShortMsg(midiIn.status, midiIn.data1, active ? 0x7F : 0);
};

//
// Init
//

PioneerDDJREV1.init = function () {

    engine.setValue("[EffectRack1_EffectUnit1]", "show_focus", 1);

    engine.makeUnbufferedConnection("[Channel1]", "VuMeter", PioneerDDJREV1.vuMeterUpdate);
    engine.makeUnbufferedConnection("[Channel2]", "VuMeter", PioneerDDJREV1.vuMeterUpdate);

    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.deck1.vuMeter, false);
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.deck2.vuMeter, false);


    engine.softTakeover("[Channel1]", "rate", true);
    engine.softTakeover("[Channel2]", "rate", true);
    engine.softTakeover("[EffectRack1_EffectUnit1_Effect1]", "meta", true);
    engine.softTakeover("[EffectRack1_EffectUnit1_Effect2]", "meta", true);
    engine.softTakeover("[EffectRack1_EffectUnit1_Effect3]", "meta", true);
    engine.softTakeover("[EffectRack1_EffectUnit1]", "mix", true);

    for (let i = 1; i <= 16; ++i) {
        engine.makeConnection("[Sampler" + i + "]", "play", PioneerDDJREV1.samplerPlayOutputCallbackFunction);
    }

    engine.makeConnection("[Channel1]", "track_loaded", PioneerDDJREV1.trackLoadedLED);
    engine.makeConnection("[Channel2]", "track_loaded", PioneerDDJREV1.trackLoadedLED);

    // play the "track loaded" animation on both decks at startup
    midi.sendShortMsg(0x9F, 0x00, 0x7F);
    midi.sendShortMsg(0x9F, 0x01, 0x7F);

    PioneerDDJREV1.setLoopButtonLights(0x90, 0x7F);
    PioneerDDJREV1.setLoopButtonLights(0x91, 0x7F);

    engine.makeConnection("[Channel1]", "loop_enabled", PioneerDDJREV1.loopToggle);
    engine.makeConnection("[Channel2]", "loop_enabled", PioneerDDJREV1.loopToggle);

    for (let i = 1; i <= 3; i++) {
        engine.makeConnection("[EffectRack1_EffectUnit1_Effect" + i + "]", "enabled", PioneerDDJREV1.toggleFxLight);
    }
    engine.makeConnection("[EffectRack1_EffectUnit1]", "focused_effect", PioneerDDJREV1.toggleFxLight);

    // query the controller for current control positions on startup
    midi.sendSysexMsg([0xF0, 0x00, 0x40, 0x05, 0x00, 0x00, 0x02, 0x06, 0x00, 0x03, 0x01, 0xf7], 12);
};

//
// Channel level lights
//

PioneerDDJREV1.vuMeterUpdate = function (value, group) {
    const newVal = value * 150;

    switch (group) {
        case "[Channel1]":
            midi.sendShortMsg(0xB0, 0x02, newVal);
            break;

        case "[Channel2]":
            midi.sendShortMsg(0xB1, 0x02, newVal);
            break;
    }
};

//
// Effects
//

PioneerDDJREV1.toggleFxLight = function (_value, _group, _control) {
    const enabled = engine.getValue(PioneerDDJREV1.focusedFxGroup(), "enabled");

    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.beatFx, enabled);
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.shiftBeatFx, enabled);
};

PioneerDDJREV1.focusedFxGroup = function () {
    const focusedFx = engine.getValue("[EffectRack1_EffectUnit1]", "focused_effect");
    return "[EffectRack1_EffectUnit1_Effect" + focusedFx + "]";
};

PioneerDDJREV1.beatFxLevelDepthRotate = function (_channel, _control, value) {
    if (PioneerDDJREV1.shiftButtonDown[0] || PioneerDDJREV1.shiftButtonDown[1]) {
        engine.softTakeoverIgnoreNextValue("[EffectRack1_EffectUnit1]", "mix");
        engine.setParameter(PioneerDDJREV1.focusedFxGroup(), "meta", value / 0x7F);
    } else {
        engine.softTakeoverIgnoreNextValue(PioneerDDJREV1.focusedFxGroup(), "meta");
        engine.setParameter("[EffectRack1_EffectUnit1]", "mix", value / 0x7F);
    }
};

PioneerDDJREV1.changeFocusedEffectBy = function (numberOfSteps) {
    let focusedEffect = engine.getValue("[EffectRack1_EffectUnit1]", "focused_effect");

    // Convert to zero-based index
    focusedEffect -= 1;

    // Standard Euclidean modulo by use of two plain modulos
    const numberOfEffectsPerEffectUnit = 3;
    focusedEffect = (((focusedEffect + numberOfSteps) % numberOfEffectsPerEffectUnit) + numberOfEffectsPerEffectUnit) % numberOfEffectsPerEffectUnit;

    // Convert back to one-based index
    focusedEffect += 1;

    engine.setValue("[EffectRack1_EffectUnit1]", "focused_effect", focusedEffect);
};

PioneerDDJREV1.beatFxLeftPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    PioneerDDJREV1.changeFocusedEffectBy(-1);
};

PioneerDDJREV1.beatFxRightPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    PioneerDDJREV1.changeFocusedEffectBy(1);
};

PioneerDDJREV1.beatFxSelectPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    engine.setValue(PioneerDDJREV1.focusedFxGroup(), "next_effect", value);
};

PioneerDDJREV1.beatFxSelectShiftPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    engine.setValue(PioneerDDJREV1.focusedFxGroup(), "prev_effect", value);
};

PioneerDDJREV1.beatFxOnOffPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    const toggleEnabled = !engine.getValue(PioneerDDJREV1.focusedFxGroup(), "enabled");
    engine.setValue(PioneerDDJREV1.focusedFxGroup(), "enabled", toggleEnabled);
};

PioneerDDJREV1.beatFxOnOffShiftPressed = function (_channel, _control, value) {
    if (value === 0) { return; }

    engine.setParameter("[EffectRack1_EffectUnit1]", "mix", 0);
    engine.softTakeoverIgnoreNextValue("[EffectRack1_EffectUnit1]", "mix");

    for (let i = 1; i <= 3; i++) {
        engine.setValue("[EffectRack1_EffectUnit1_Effect" + i + "]", "enabled", 0);
    }
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.beatFx, false);
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.shiftBeatFx, false);
};

PioneerDDJREV1.beatFxChannel = function (_channel, control, value, _status, group) {
    if (value === 0x00) { return; }

    const enableChannel1 = control === 0x10 ? 1 : 0,
        enableChannel2 = control === 0x11 ? 1 : 0,
        enableMaster = control === 0x14 ? 1 : 0;

    engine.setValue(group, "group_[Channel1]_enable", enableChannel1);
    engine.setValue(group, "group_[Channel2]_enable", enableChannel2);
    engine.setValue(group, "group_[Master]_enable", enableMaster);
};

//
// Loop IN/OUT ADJUST
//

PioneerDDJREV1.toggleLoopAdjustIn = function (channel, _control, value, _status, group) {
    if (value === 0 || engine.getValue(group, "loop_enabled" === 0)) {
        return;
    }
    PioneerDDJREV1.loopAdjustIn[channel] = !PioneerDDJREV1.loopAdjustIn[channel];
    PioneerDDJREV1.loopAdjustOut[channel] = false;
};

PioneerDDJREV1.toggleLoopAdjustOut = function (channel, _control, value, _status, group) {
    if (value === 0 || engine.getValue(group, "loop_enabled" === 0)) {
        return;
    }
    PioneerDDJREV1.loopAdjustOut[channel] = !PioneerDDJREV1.loopAdjustOut[channel];
    PioneerDDJREV1.loopAdjustIn[channel] = false;
};

// Two signals are sent here so that the light stays lit/unlit in its shift state too
PioneerDDJREV1.setReloopLight = function (status, value) {
    midi.sendShortMsg(status, 0x4D, value);
    midi.sendShortMsg(status, 0x50, value);
};


PioneerDDJREV1.setLoopButtonLights = function (status, value) {
    [0x10, 0x11, 0x4E, 0x4C].forEach(function (control) {
        midi.sendShortMsg(status, control, value);
    });
};

PioneerDDJREV1.startLoopLightsBlink = function (channel, control, status, group) {
    let blink = 0x7F;

    PioneerDDJREV1.stopLoopLightsBlink(group, control, status);

    PioneerDDJREV1.timers[group][control] = engine.beginTimer(500, function () {
        blink = 0x7F - blink;

        // When adjusting the loop out position, turn the loop in light off
        if (PioneerDDJREV1.loopAdjustOut[channel]) {
            midi.sendShortMsg(status, 0x10, 0x00);
            midi.sendShortMsg(status, 0x4C, 0x00);
        } else {
            midi.sendShortMsg(status, 0x10, blink);
            midi.sendShortMsg(status, 0x4C, blink);
        }

        // When adjusting the loop in position, turn the loop out light off
        if (PioneerDDJREV1.loopAdjustIn[channel]) {
            midi.sendShortMsg(status, 0x11, 0x00);
            midi.sendShortMsg(status, 0x4E, 0x00);
        } else {
            midi.sendShortMsg(status, 0x11, blink);
            midi.sendShortMsg(status, 0x4E, blink);
        }
    });

};

PioneerDDJREV1.stopLoopLightsBlink = function (group, control, status) {
    PioneerDDJREV1.timers[group] = PioneerDDJREV1.timers[group] || {};

    if (PioneerDDJREV1.timers[group][control] !== undefined) {
        engine.stopTimer(PioneerDDJREV1.timers[group][control]);
    }
    PioneerDDJREV1.timers[group][control] = undefined;
    PioneerDDJREV1.setLoopButtonLights(status, 0x7F);
};

PioneerDDJREV1.loopToggle = function (value, group, control) {
    const status = group === "[Channel1]" ? 0x90 : 0x91,
        channel = group === "[Channel1]" ? 0 : 1;

    PioneerDDJREV1.setReloopLight(status, value ? 0x7F : 0x00);

    if (value) {
        PioneerDDJREV1.startLoopLightsBlink(channel, control, status, group);
    } else {
        PioneerDDJREV1.stopLoopLightsBlink(group, control, status);
        PioneerDDJREV1.loopAdjustIn[channel] = false;
        PioneerDDJREV1.loopAdjustOut[channel] = false;
    }
};

//
// CUE/LOOP CALL
//

PioneerDDJREV1.cueLoopCallLeft = function (_channel, _control, value, _status, group) {
    if (value) {
        engine.setValue(group, "loop_scale", 0.5);
    }
};

PioneerDDJREV1.cueLoopCallRight = function (_channel, _control, value, _status, group) {
    if (value) {
        engine.setValue(group, "loop_scale", 2.0);
    }
};

//
// BEAT SYNC
//
// Note that the controller sends different signals for a short press and a long
// press of the same button.
//

PioneerDDJREV1.syncPressed = function (channel, control, value, status, group) {
    if (engine.getValue(group, "sync_enabled") && value > 0) {
        engine.setValue(group, "sync_enabled", 0);
    } else {
        engine.setValue(group, "beatsync", value);
    }
};

PioneerDDJREV1.syncLongPressed = function (channel, control, value, status, group) {
    if (value) {
        engine.setValue(group, "sync_enabled", 1);
    }
};

PioneerDDJREV1.cycleTempoRange = function (_channel, _control, value, _status, group) {
    if (value === 0) { return; } // ignore release

    const currRange = engine.getValue(group, "rateRange");
    let idx = 0;

    for (let i = 0; i < this.tempoRanges.length; i++) {
        if (currRange === this.tempoRanges[i]) {
            idx = (i + 1) % this.tempoRanges.length;
            break;
        }
    }
    engine.setValue(group, "rateRange", this.tempoRanges[idx]);
};

//
// Jog wheels
//

PioneerDDJREV1.toggleVinylMode = function (channel, _control, value, _status, group) {
    if (value === 0) { return; } // ignore release

    PioneerDDJREV1.vinylMode[channel] = !PioneerDDJREV1.vinylMode[channel];

    if (PioneerDDJREV1.vinylMode[channel]) {
        midi.sendShortMsg(PioneerDDJREV1.channels[channel], 0x17, 0xff);
    } else {
        midi.sendShortMsg(PioneerDDJREV1.channels[channel], 0x17, 0x00);
    }
}


PioneerDDJREV1.jogTurn = function (channel, _control, value, _status, group) {
    const deckNum = channel + 1;
    // wheel center at 64; <64 rew >64 fwd
    let newVal = value - 64;

    // loop_in / out adjust
    const loopEnabled = engine.getValue(group, "loop_enabled");
    if (loopEnabled > 0) {
        if (PioneerDDJREV1.loopAdjustIn[channel]) {
            newVal = newVal * PioneerDDJREV1.loopAdjustMultiply + engine.getValue(group, "loop_start_position");
            engine.setValue(group, "loop_start_position", newVal);
            return;
        }
        if (PioneerDDJREV1.loopAdjustOut[channel]) {
            newVal = newVal * PioneerDDJREV1.loopAdjustMultiply + engine.getValue(group, "loop_end_position");
            engine.setValue(group, "loop_end_position", newVal);
            return;
        }
    }

    if (engine.isScratching(deckNum)) {
        engine.scratchTick(deckNum, newVal);
    } else { // fallback
        engine.setValue(group, "jog", newVal * this.bendScale);
    }
};


PioneerDDJREV1.jogSearch = function (_channel, _control, value, _status, group) {
    const newVal = (value - 64) * PioneerDDJREV1.fastSeekScale;
    engine.setValue(group, "jog", newVal);
};

PioneerDDJREV1.jogTouch = function (channel, _control, value) {
    const deckNum = channel + 1;

    // skip while adjusting the loop points
    if (PioneerDDJREV1.loopAdjustIn[channel] || PioneerDDJREV1.loopAdjustOut[channel]) {
        return;
    }

    if (value !== 0 && this.vinylMode) {
        engine.scratchEnable(deckNum, 720, 33 + 1 / 3, this.alpha, this.beta);
    } else {
        engine.scratchDisable(deckNum);
    }
};

//
// Shift button
//

PioneerDDJREV1.shiftPressed = function (channel, _control, value, _status, _group) {
    PioneerDDJREV1.shiftButtonDown[channel] = value === 0x7F;
};


//
// Tempo sliders
//
// The tempo option in Mixxx's deck preferences determine whether down/up
// increases/decreases the rate. Therefore it must be inverted here so that the
// UI and the control sliders always move in the same direction.
//

PioneerDDJREV1.tempoSliderMSB = function (channel, control, value, status, group) {
    PioneerDDJREV1.highResMSB[group].tempoSlider = value;
};

PioneerDDJREV1.tempoSliderLSB = function (channel, control, value, status, group) {
    const fullValue = (PioneerDDJREV1.highResMSB[group].tempoSlider << 7) + value;

    engine.setValue(
        group,
        "rate",
        1 - (fullValue / 0x2000)
    );
};

//
// Beat Jump mode
//
// Note that when we increase/decrease the sizes on the pad buttons, we use the
// value of the first pad (0x21) as an upper/lower limit beyond which we don't
// allow further increasing/decreasing of all the values.
//

PioneerDDJREV1.beatjumpPadPressed = function (_channel, control, value, _status, group) {
    if (value === 0) {
        return;
    }
    engine.setValue(group, "beatjump_size", Math.abs(PioneerDDJREV1.beatjumpSizeForPad[control]));
    engine.setValue(group, "beatjump", PioneerDDJREV1.beatjumpSizeForPad[control]);
};

PioneerDDJREV1.increaseBeatjumpSizes = function (_channel, control, value, _status, group) {
    if (value === 0 || PioneerDDJREV1.beatjumpSizeForPad[0x21] * 16 > 16) {
        return;
    }
    Object.keys(PioneerDDJREV1.beatjumpSizeForPad).forEach(function (pad) {
        PioneerDDJREV1.beatjumpSizeForPad[pad] = PioneerDDJREV1.beatjumpSizeForPad[pad] * 16;
    });
    engine.setValue(group, "beatjump_size", PioneerDDJREV1.beatjumpSizeForPad[0x21]);
};

PioneerDDJREV1.decreaseBeatjumpSizes = function (_channel, control, value, _status, group) {
    if (value === 0 || PioneerDDJREV1.beatjumpSizeForPad[0x21] / 16 < 1 / 16) {
        return;
    }
    Object.keys(PioneerDDJREV1.beatjumpSizeForPad).forEach(function (pad) {
        PioneerDDJREV1.beatjumpSizeForPad[pad] = PioneerDDJREV1.beatjumpSizeForPad[pad] / 16;
    });
    engine.setValue(group, "beatjump_size", PioneerDDJREV1.beatjumpSizeForPad[0x21]);
};

//
// Sampler mode
//

PioneerDDJREV1.samplerPlayOutputCallbackFunction = function (value, group, _control) {
    if (value === 1) {
        const curPad = group.match(script.samplerRegEx)[1];
        PioneerDDJREV1.startSamplerBlink(
            0x97 + (curPad > 8 ? 2 : 0),
            0x30 + ((curPad > 8 ? curPad - 8 : curPad) - 1),
            group);
    }
};

PioneerDDJREV1.samplerPadPressed = function (_channel, _control, value, _status, group) {
    if (engine.getValue(group, "track_loaded")) {
        engine.setValue(group, "cue_gotoandplay", value);
    } else {
        engine.setValue(group, "LoadSelectedTrack", value);
    }
};

PioneerDDJREV1.samplerPadShiftPressed = function (_channel, _control, value, _status, group) {
    if (engine.getValue(group, "play")) {
        engine.setValue(group, "cue_gotoandstop", value);
    } else if (engine.getValue(group, "track_loaded")) {
        engine.setValue(group, "eject", value);
    }
};

PioneerDDJREV1.startSamplerBlink = function (channel, control, group) {
    let val = 0x7f;

    PioneerDDJREV1.stopSamplerBlink(channel, control);
    PioneerDDJREV1.timers[channel][control] = engine.beginTimer(250, function () {
        val = 0x7f - val;

        // blink the appropriate pad
        midi.sendShortMsg(channel, control, val);
        // also blink the pad while SHIFT is pressed
        midi.sendShortMsg((channel + 1), control, val);

        const isPlaying = engine.getValue(group, "play") === 1;

        if (!isPlaying) {
            // kill timer
            PioneerDDJREV1.stopSamplerBlink(channel, control);
            // set the pad LED to ON
            midi.sendShortMsg(channel, control, 0x7f);
            // set the pad LED to ON while SHIFT is pressed
            midi.sendShortMsg((channel + 1), control, 0x7f);
        }
    });
};

PioneerDDJREV1.stopSamplerBlink = function (channel, control) {
    PioneerDDJREV1.timers[channel] = PioneerDDJREV1.timers[channel] || {};

    if (PioneerDDJREV1.timers[channel][control] !== undefined) {
        engine.stopTimer(PioneerDDJREV1.timers[channel][control]);
        PioneerDDJREV1.timers[channel][control] = undefined;
    }
};

//
// Additional features
//

PioneerDDJREV1.toggleQuantize = function (_channel, _control, value, _status, group) {
    if (value) {
        script.toggleControl(group, "quantize");
    }
};

PioneerDDJREV1.quickJumpForward = function (_channel, _control, value, _status, group) {
    if (value) {
        engine.setValue(group, "beatjump", PioneerDDJREV1.quickJumpSize);
    }
};

PioneerDDJREV1.quickJumpBack = function (_channel, _control, value, _status, group) {
    if (value) {
        engine.setValue(group, "beatjump", -PioneerDDJREV1.quickJumpSize);
    }
};

//
// Shutdown
//

PioneerDDJREV1.shutdown = function () {
    // reset vumeter
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.deck1.vuMeter, false);
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.deck2.vuMeter, false);

    // housekeeping
    // turn off all Sampler LEDs
    for (let i = 0; i <= 7; ++i) {
        midi.sendShortMsg(0x97, 0x30 + i, 0x00);    // Deck 1 pads
        midi.sendShortMsg(0x98, 0x30 + i, 0x00);    // Deck 1 pads with SHIFT
        midi.sendShortMsg(0x99, 0x30 + i, 0x00);    // Deck 2 pads
        midi.sendShortMsg(0x9A, 0x30 + i, 0x00);    // Deck 2 pads with SHIFT
    }
    // turn off all Hotcue LEDs
    for (let i = 0; i <= 7; ++i) {
        midi.sendShortMsg(0x97, 0x00 + i, 0x00);    // Deck 1 pads
        midi.sendShortMsg(0x98, 0x00 + i, 0x00);    // Deck 1 pads with SHIFT
        midi.sendShortMsg(0x99, 0x00 + i, 0x00);    // Deck 2 pads
        midi.sendShortMsg(0x9A, 0x00 + i, 0x00);    // Deck 2 pads with SHIFT
    }

    // turn off loop in and out lights
    PioneerDDJREV1.setLoopButtonLights(0x90, 0x00);
    PioneerDDJREV1.setLoopButtonLights(0x91, 0x00);

    // turn off reloop lights
    PioneerDDJREV1.setReloopLight(0x90, 0x00);
    PioneerDDJREV1.setReloopLight(0x91, 0x00);

    // stop any flashing lights
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.beatFx, false);
    PioneerDDJREV1.toggleLight(PioneerDDJREV1.lights.shiftBeatFx, false);
};
