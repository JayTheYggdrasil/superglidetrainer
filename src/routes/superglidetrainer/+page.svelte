<script>
    import { onMount, afterUpdate } from "svelte";
    import { writable } from "svelte/store";
    import { siteTitle } from "../../lib/config";
    import Faq from "../../lib/components/Faq.svelte";
    import Footer from "../../lib/components/Footer.svelte";
    import Tips from "../../lib/components/Tips.svelte";

    const devices = {
        Keyboard: "keyboard",
        Mouse: "mouse",
        Wheel: "wheel",
    };
    // default settings
    const settings = writable({
        jump: { type: devices.Keyboard, bind: " " },
        crouch: { type: devices.Keyboard, bind: "Control" },
        fps: 144,
    });

    const states = {
        Ready: "ready", // Initial State
        Jump: "jump", // Partial Sequence
        JumpWarned: "jumpwarned", // Multi-Jump Warning Sent
        Crouch: "crouch", // Incorrect Sequence, let it play out for a bit
    };
    const events = {
        Keydown: "keydown",
        Mousedown: "mousedown",
        Mouseup: "mouseup",
        Wheel: "wheel",
        Popstate: "popstate",
        Contextmenu: "contextmenu",
    };

    let inputListeners = [];
    let modalNotification = false;
    let assignWarning = false;
    let trainingActive = false;
    let settingActive = false;
    $: frameTime = 1 / $settings.fps;
    let instructions = "";
    let instructionColor = "";
    let superglideText = "";
    let superglideTextColor = "";
    let message = "";
    let history = [];
    let historydiv;
    let state = states.Ready;
    let lastState = states.Jump;
    let startTime = new Date();
    let chance = 0;
    let attempts = [];
    let potentialSuperglides = [];
    $: potentialSuperglidesPercentage = (potentialSuperglides.length / attempts.length) * 100 || 0;
    $: potentialSum = potentialSuperglides.reduce((a, b) => a + b, 0);
    $: potentialAvg = potentialSum / potentialSuperglides.length || 0;
    $: superglideConsistency = potentialSum / attempts.length || 0;
    let wrongInputCount = 0;
    let crouchTooLateCount = 0;
    $: wrongInputPercentage = (wrongInputCount / attempts.length) * 100 || 0;
    $: crouchTooLatePercentage = (crouchTooLateCount / attempts.length) * 100 || 0;

    // i dont know how to access sass variables in svelte, so i did this
    const colorScheme = {
        success: "#2ecc71",
        primary: "#1abc9c",
        warning: "#f1b70e",
        orange: "#e67e22",
        danger: "#e74c3c",
    };

    let gradientArray = Object.values(colorScheme);

    function updateHistory(objArr) {
        objArr.forEach((obj) => {
            history = [...history, obj];

            if (obj.finished) {
                gradientArray = [...gradientArray, colorScheme[obj.color]];
            }
        });
    }

    onMount(() => {
        // keep the scrollbar at the bottom
        if (trainingActive) {
            historydiv.scrollTop = historydiv.scrollHeight;
        }

        // load settings from localstorage
        const content = localStorage.getItem("content");
        if (content) {
            $settings = JSON.parse(content);
        }

        const unsubscribe = settings.subscribe((value) => {
            localStorage.setItem("content", JSON.stringify(value));
        });

        return unsubscribe;
    });

    afterUpdate(() => {
        // keep the scrollbar at the bottom
        if (trainingActive) {
            historydiv.scrollTop = historydiv.scrollHeight;
        }
    });

    $: percentageColor = (value) => {
        if (value >= 75) {
            return "success";
        } else if (value >= 50) {
            return "primary";
        } else if (value >= 25) {
            return "warning";
        } else if (value > 0) {
            return "orange";
        } else {
            return "danger";
        }
    };

    $: prettyBind = (setting) => {
        let buttonText = "";
        switch ($settings[setting].type) {
            case devices.Keyboard:
                buttonText = $settings[setting].bind === " " ? "SPACE" : $settings[setting].bind.toUpperCase();
                break;
            case devices.Mouse:
                buttonText = `Mousebutton ${$settings[setting].bind}`;
                break;
            case devices.Wheel:
                buttonText = `Mousewheel ${$settings[setting].bind > 0 ? "DOWN" : "UP"}`;
                break;
            default:
                break;
        }

        const icon_map = {
            keyboard: "keyboard",
            mouse: "mouse",
            wheel: "mouse",
        };
        const icon_class = `fas fa-${icon_map[$settings[setting].type]}`;
        return `${buttonText}&nbsp;&nbsp;
                <span class="icon">
                    <i class="${icon_class}"></i>
                </span>`;
    };

    // always go to the first forward history, which does not exist.
    function disableHistory() {
        window.history.go(1);
    }

    // prevent the right-click menu
    function disableContextmenu(event) {
        event.preventDefault();
    }

    function toggleState() {
        trainingActive = !trainingActive;
        // removes focus to disable activation by spacebar
        this.blur();
        // reset to default values when stopping
        if (!trainingActive) {
            window.removeEventListener(events.Popstate, disableHistory);
            window.removeEventListener(inputListeners[0][0], inputListeners[0][1]);
            window.removeEventListener(inputListeners[1][0], inputListeners[1][1]);
            window.removeEventListener(events.Contextmenu, disableContextmenu);
            inputListeners = [];
        } else {
            // clear forward history
            window.history.pushState(null, null, window.location.href);
            window.addEventListener(events.Popstate, disableHistory);
            window.addEventListener(events.Contextmenu, disableContextmenu);
            message = "";
            superglideText = "";
            superglide();
        }
    }

    function getOtherKey(setting) {
        const otherSetting = setting === "jump" ? "crouch" : "jump";
        return $settings[otherSetting].bind;
    }

    function setSetting(setting) {
        function removeListeners() {
            window.removeEventListener(events.Keydown, handleKeyboard);
            window.removeEventListener(events.Mouseup, handleMouse);
            window.removeEventListener(events.Wheel, handleWheel);
            // TODO: find a better solution for this
            setTimeout(function () {
                window.removeEventListener(events.Contextmenu, disableContextmenu);
            }, 1000);
        }

        function handleKeyboard(event) {
            event.preventDefault();

            if (event.key !== getOtherKey(setting)) {
                $settings[setting].type = devices.Keyboard;
                $settings[setting].bind = event.key;
                modalNotification = false;
                assignWarning = false;
                removeListeners();
            } else {
                assignWarning = true;
            }
            event.target.blur();
        }

        function handleMouse(event) {
            event.preventDefault();

            if (event.button !== getOtherKey(setting)) {
                $settings[setting].type = devices.Mouse;
                $settings[setting].bind = event.button;
                modalNotification = false;
                assignWarning = false;
                removeListeners();
            } else {
                assignWarning = true;
            }
            event.target.parentElement.blur();
        }

        function handleWheel(event) {
            event.preventDefault();

            if (Math.sign(event.deltaY) !== getOtherKey(setting)) {
                $settings[setting].type = devices.Wheel;
                $settings[setting].bind = Math.sign(event.deltaY);
                modalNotification = false;
                assignWarning = false;
                removeListeners();
            } else {
                assignWarning = true;
            }
        }

        if (!modalNotification) {
            modalNotification = true;
            window.addEventListener(events.Keydown, handleKeyboard);
            // Mouseup, because we want to keep the disableContextmenu listener longer than the click to still disable it
            window.addEventListener(events.Mouseup, handleMouse);
            window.addEventListener(events.Wheel, handleWheel, {
                passive: false,
            });
            window.addEventListener(events.Contextmenu, disableContextmenu);
            // Unable to preventDefault in passive event listner, which causes page to scroll down when binding it to the input.
            // https://chromestatus.com/feature/6662647093133312
        } else {
            removeListeners();
            modalNotification = false;
            settingActive = false;
        }
    }

    function get_device_props(device_type, e = null) {
        switch (device_type) {
            case devices.Keyboard:
                return [events.Keydown, e?.key];
            case devices.Mouse:
                return [events.Mousedown, e?.button];
            case devices.Wheel:
                return [events.Wheel, Math.sign(e?.deltaY)];
        }
    }

    function waitingKeypress() {
        const devices = [$settings.jump.type, $settings.crouch.type];
        inputListeners = [];
        return new Promise((resolve) => {
            devices.forEach((dev) => {
                const [event_name, _] = get_device_props(dev, null);
                window.addEventListener(event_name, onEventHandler, {
                    passive: false,
                });
                function onEventHandler(e) {
                    window.removeEventListener(event_name, onEventHandler);
                    const [_, return_value] = get_device_props(dev, e);
                    // only prevent default for the two set keys (only works for keyboard events)
                    if (return_value === $settings.jump.bind || return_value === $settings.crouch.bind) {
                        e.preventDefault();
                    }
                    resolve(return_value);
                }
                inputListeners.push([event_name, onEventHandler]);
            });
        });
    }

    async function superglide() {
        while (trainingActive) {
            if (lastState !== state) {
                if (state === states.Jump) {
                    instructions = "Press crouch";
                    instructionColor = "";
                } else if (state === states.Ready) {
                    instructions = "Press jump";
                    instructionColor = "";
                }
            }

            lastState = state;
            let key = await waitingKeypress();
            console.log(`Pressed key "${key}"`);

            if (key === $settings.crouch.bind) {
                if (state === states.Ready) {
                    startTime = new Date();
                    state = states.Crouch;
                } else if (state === states.Jump || state === states.JumpWarned) {
                    const now = new Date();
                    const calucated = (now.getTime() - startTime.getTime()) / 1000;
                    const elapsedFrames = calucated / frameTime;
                    const differenceSeconds = frameTime - calucated;
                    const lateBy = Math.abs(1 - elapsedFrames);

                    if (elapsedFrames < 1) {
                        chance = elapsedFrames * 100;
                        message = `Crouch later by ${lateBy.toFixed(1)} frames (${differenceSeconds.toFixed(5)}s)`;
                    } else if (elapsedFrames < 2) {
                        chance = (2 - elapsedFrames) * 100;
                        message = `Crouch sooner by ${lateBy.toFixed(1)} frames (${(differenceSeconds * -1).toFixed(5)}s)`;
                    } else {
                        message = `Crouched too late by ${lateBy.toFixed(1)} frames (${(differenceSeconds * -1).toFixed(5)}s)`;
                        chance = 0;
                        crouchTooLateCount += 1;
                    }

                    updateHistory([
                        {
                            line: message,
                            color: "light",
                            finished: false,
                        },
                        {
                            line: `${elapsedFrames.toFixed(1)} frames have passed`,
                            color: "light",
                            finished: false,
                        },
                    ]);

                    if (chance > 0) {
                        potentialSuperglides = [...potentialSuperglides, chance];
                    }
                    superglideText = `${chance.toFixed(2)}% chance to hit the superglide`;
                    superglideTextColor = percentageColor(chance);

                    updateHistory([
                        {
                            line: superglideText,
                            color: percentageColor(chance),
                            finished: true,
                        },
                    ]);

                    attempts = [...attempts, chance];
                    state = states.Ready;
                } else if (state === states.Crouch) {
                    instructions = "Double Crouch Input, resetting";
                    instructionColor = "danger";
                    chance = 0;
                    state = states.Ready;
                }
            } else if (key === $settings.jump.bind) {
                if (state === states.Ready) {
                    startTime = new Date();
                    state = states.Jump;
                } else if (state === states.Jump) {
                    state = states.JumpWarned;
                    instructions = "Multiple jumps detected, results may not reflect ingame behavior.";
                    instructionColor = "warning";
                    superglideText = "";
                } else if (state === states.JumpWarned) {
                    state = states.JumpWarned;
                } else if (state === states.Crouch) {
                    instructions = "You must jump before you crouch";
                    instructionColor = "danger";
                    updateHistory([
                        {
                            line: instructions,
                            color: instructionColor,
                            finished: false,
                        },
                    ]);

                    const now = new Date();
                    const delta = (now.getTime() - startTime) / 1000 + frameTime;
                    const earlyBy = delta / frameTime;

                    chance = 0;

                    superglideText = "0% chance to hit the superglide";
                    superglideTextColor = percentageColor(chance);
                    message = `Crouch later by ${earlyBy.toFixed(2)} frames (${delta.toFixed(5)}s)`;
                    updateHistory([
                        {
                            line: message,
                            color: "light",
                            finished: false,
                        },
                        {
                            line: superglideText,
                            color: superglideTextColor,
                            finished: true,
                        },
                    ]);
                    wrongInputCount += 1;
                    attempts = [...attempts, chance];
                    state = states.Ready;
                }
            } else {
                instructions = `Other key pressed, ignoring`;
                instructionColor = "warning";
            }
        }
    }
</script>

<section class="section background-image">
    <div class="container">
        <h1 class="title is-1 has-text-centered">
            <span class="icon is-medium">
                <img src="/logo.png" alt="superglidetrainer logo" style="transform: scaleX(-1);" />
            </span>
            {siteTitle}
            <span class="icon is-medium">
                <img src="/logo.png" alt="superglidetrainer logo" />
            </span>
        </h1>
        <div
            class="box has-text-centered gradient"
            style="border-bottom: 12px solid transparent; border-image: linear-gradient(90deg, rgba(0, 0, 0, 0), {gradientArray
                .slice(-10)
                .join(',')}, rgba(0, 0, 0, 0)) 1; width: 100%"
        >
            <p>
                A Superglide needs a jump input first and then a crouch input 1 frame later. You need to do the whole Superglide in the last 0.1-0.2 second of a
                mantle.
            </p>
            <br />
            <p>
                That makes the correct timing of Jump -> Crouch way harder than timing the whole Superglide in the mantle. This trainer will help you learn that
                much harder Jump -> Crouch timing.
            </p>
        </div>
        <div class="columns">
            <div class="column">
                <div class="box has-text-centered">
                    <h3 class="title is-3">
                        <span class="icon-text"><span class="icon"><i class="fas fa-dumbbell" /></span>&nbsp;<span>Training</span></span>
                    </h3>
                    <p class="subtitle">Click on the buttons to re-bind them</p>
                    <div class="field">
                        <div class="field-body">
                            <div class="field has-addons">
                                <p class="control">
                                    <button class="button is-link is-outlined no-hover"> Jump </button>
                                </p>
                                <p class="control">
                                    <button class="button setting-button is-link is-outlined" on:click={() => setSetting("jump")}>
                                        {@html prettyBind("jump")}
                                    </button>
                                    <!-- <span class="tag" /> -->
                                </p>
                            </div>
                            <div class="field has-addons">
                                <p class="control">
                                    <button class="button is-link is-outlined no-hover"> Crouch </button>
                                </p>
                                <p class="control">
                                    <button class="button is-link is-outlined setting-button" on:click={() => setSetting("crouch")}
                                        >{@html prettyBind("crouch")}
                                        <!-- <span class="tag" /> -->
                                    </button>
                                </p>
                            </div>
                            <div class="field has-addons">
                                <p class="control">
                                    <button class="button is-link is-outlined no-hover"> FPS </button>
                                </p>
                                <p class="control">
                                    <input
                                        class="input is-link is-outlined has-background-dark has-text-white"
                                        bind:value={$settings.fps}
                                        type="number"
                                        min="1"
                                    />
                                </p>
                            </div>
                        </div>
                    </div>
                    {#if modalNotification}
                        <div class="notification is-info">Press any key or mouse button to bind</div>
                    {/if}
                    {#if assignWarning}
                        <div class="notification is-danger">This key is already assigned</div>
                    {/if}
                    {#if trainingActive}
                        <div class="notification is-{instructionColor}">
                            {instructions}
                        </div>
                        {#if message}
                            <div class="notification is-{superglideTextColor}">
                                {#if superglideText}
                                    <p class="has-text-weight-bold is-size-5">
                                        {superglideText}
                                    </p>
                                {/if}
                                {message}
                            </div>
                        {/if}
                    {/if}
                    <button class="button is-medium is-fullwidth {trainingActive ? 'is-danger' : 'is-success'}" on:click={toggleState}>
                        {trainingActive ? "Stop" : "Start"}
                    </button>
                </div>
            </div>
            <div class="column">
                <div class="box">
                    <h3 class="title has-text-centered is-3">
                        <span class="icon-text"><span class="icon"><i class="fas fa-chart-bar" /></span>&nbsp;<span>Analytics</span></span>
                    </h3>
                    <div class="columns">
                        <div class="column">
                            <p class="has-text-weight-bold is-size-5">
                                Overall superglide consistency: <code class="has-text-{percentageColor(superglideConsistency)}"
                                    >{superglideConsistency.toFixed(2)}%</code
                                >
                            </p>
                            <div class="divider" />
                            <p>
                                Attempts: <code class="has-text-white"> {attempts.length}</code>
                            </p>
                            <p>
                                Potential superglides: <code class="has-text-white">{potentialSuperglidesPercentage.toFixed(2)}%</code>
                            </p>
                            <p>
                                Average successful chance: <code class="has-text-white">{potentialAvg.toFixed(2)}%</code>
                            </p>
                            <br />
                            <!-- <p>You got <code>0%</code> because:</p> -->
                            <p>
                                Wrong input first: <code>{wrongInputPercentage.toFixed(2)}%</code>
                            </p>
                            <p>
                                Crouch too late: <code>{crouchTooLatePercentage.toFixed(2)}%</code>
                            </p>
                            <!-- <br />
                            <p>
                                On a potential superglide your crouch is too
                                late by
                                <code>0.0134</code> ms or <code>0.4</code> FPS on
                                average
                            </p> -->
                            <div class="divider" />
                            <div class="notification">
                                <p>READ THE FAQ!!!</p>
                                <p>Seriously if you can't hit them,</p>
                                <p>
                                    <strong>READ THE TIPS AND FAQ!!!</strong>
                                </p>
                                <p>ALL OF IT!</p>
                            </div>
                        </div>
                        <div class="divider is-vertical" />
                        <div class="column history" bind:this={historydiv}>
                            {#each history as { line, color, finished }}
                                <p>
                                    <span class="tag is-{color}">{line}</span>
                                </p>
                                {#if finished}
                                    <div class="divider" />
                                {/if}
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <br />
    <Tips />
    <br />
    <Faq />
</section>
<Footer />
