# DataCenterMania PRD v4: Phase 4 "Meta Quest 2"

Goal: play DataCenterMania on a **Meta Quest 2**, without a native app and without a store: the Quest Browser runs the same web game and supports WebXR. Two releases, because they answer different needs.

| Release | Theme | Scope |
|---|---|---|
| **4.0 "Quest Mode"** | Works today in the headset's browser | Auto-detect the Quest Browser (or `?quest=1`), a laser-pointer friendly profile: bigger text and tap targets, hover feedback, thick scrollbars, no keyboard needs. A *Meta Quest* display option |
| **4.1 "Immersive Hall"** | Stand inside the data center | An **Enter VR** button (when the browser offers `immersive-vr`) that opens the hall as a 3D room: racks coloured by temperature, coolers, technicians, alarm beacons, a wrist-height control panel with pause and speed, laser-pointer selection of a rack with its status, and a one-trigger *Dispatch* for alarms. Built with three.js, loaded only when VR is entered |

Honest limits, stated up front:
- No headset is available in the build environment. Everything that is pure logic (detection, the 3D scene model, the picking maths, the panel text) is unit-tested; the WebXR glue is written to the WebXR spec and checked by building and by running the game in a browser without XR (the button stays hidden and nothing breaks). **A first run on a real Quest 2 is the acceptance test** and may need small fixes.
- Quest Browser does not allow DOM content inside an immersive session, so the VR view has its own small 3D panel instead of the HTML interface. The full HTML game stays available in the browser window and is what *Quest Mode* improves.
- Hand tracking, passthrough and a Store-listed APK are out of scope.

How to play on Quest 2: open the game's address in the Quest Browser (Menu, Browser), tap the install/bookmark option if you want it in your library, choose *Meta Quest* under Settings, Display if it was not detected, and press *Enter VR* for the immersive hall.

Results sections follow.

## 4.0 "Quest Mode" results

- **Detection**: the Oculus Browser user agent (or any "Quest" device name), or `?quest=1` / `?quest=0` in the address; **Settings, Display, Meta Quest** forces it, and *Colour screen* or *E-ink* turn it off. Quest is never treated as e-ink.
- **Profile** (a `quest` class on the page): 56 px minimum height for buttons, selects and list headers, 72 px tabs, 64 px map zoom buttons, 60 px speed buttons, bigger checkboxes, a bright outline on whatever the laser points at, thick scrollbars, and large text by default unless the player chose a text size in the accessibility settings.
- Nothing else changes: it is the same game, saves and progress as on a phone or desktop, and works with the Quest's pointer, trigger and thumbstick scrolling.
- 2 new unit tests (detection, setting precedence) and an e2e that loads the game with `?quest=1` and checks the class and the button height.

## 4.1 "Immersive Hall" results (experimental: needs a headset to be proven)

- **Enter VR** button, shown only when the browser reports `immersive-vr` support (a Quest Browser does; desktop browsers without a headset do not, so nothing changes there). The VR code (three.js) is a separate chunk loaded only on demand.
- **The room**: the hall rebuilt as 3D every frame from the game state: racks (0.6 x 2 x 1 m, 0.8 m per tile) coloured green, amber, orange, red by temperature and dark when the breaker tripped, a blinking beacon over a rack with an alarm (amber, orange, red by severity), coolers (blue, grey when off), technicians (yellow, orange when busy), a floor sized to the hall, placed in front of the player.
- **Controls**: a laser on each controller; pull the trigger to select a rack (it glows) or press a panel button. The floating panel (left of the player, canvas texture) shows the clock, cash and speed, the selected rack's temperature, load and servers up, buttons for pause, 1x, 2x, 4x, *Exit VR* and **Send the best tech**, which sends the most urgent fixable alarm of the selected rack (or the hall) the same command the Alarms tab sends.
- **The game keeps running** through the same animation tick as on screen, so shifts, alarms and saves behave identically; leaving VR returns to the normal view.
- **Tested here**: the scene model, heat colours, alarm severity, picking rays against racks, the panel layout (no overlaps, hit tests), the dispatch command and the no-WebXR path (unit tests); the button, lazy loading of the VR chunk and error reporting with a stubbed WebXR (e2e). **Not tested here**: rendering and controllers on a real headset. Expect a first-run fix or two (controller button mapping, panel position, frame rate).
- **Not included**: moving around by thumbstick (the hall is walked by physically moving in room scale), voice, hands, passthrough, or the full HTML interface inside VR (the Quest Browser does not allow it).

## Phase 4 summary and how to try it on a Quest 2

1. Put the game online (the Pages deployment of this branch), open its address in the **Quest Browser**.
2. The Meta Quest profile switches on by itself (or choose it in Settings, Display, or add `?quest=1` to the address): large, hover-highlighted targets for the laser.
3. Press **🥽 Enter VR** (bottom right) to stand in the hall. Trigger on a rack to select it, trigger on the panel to pause, change speed or send the best technician. *Exit VR* returns to the window.
4. Tell me what breaks: the VR view has never run on a headset, so controller mapping, panel placement and frame rate are the first things to tune.
