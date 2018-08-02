// Small game/sample & music written by David Rousset - https://twitter.com/davrous
// Works with mouse/touch/pen on desktop and mobiles thanks to pointer events
// Can be used with a VR compatible headset (Windows Mixed Reality, Oculus & HTC Vive)
// With one or two 6-DOF controllers
//
// 3D Assets from http://www.remix3d.com 
//
// Usage:
//  - Draw lines using mouse/touch/pen to draw lines to destroy apples behind
//  - Press 'ESC' to pause the game and display the menu
//
// Usage in VR:
//  - Connect a VR headset if your browser is WebVR compatible then press the "Play in VR" button to enter VR in your connected HMD
//  - point on the buttons using the controller and click using the trigger
//  - while in game, press the second button (menu on MR) to pause and display the menu
var VRHelper;
// Testing WebVR support
const supportsVR = 'getVRDisplays' in navigator;
var allVrAssetsReady = false;
// Total number of bytes to download before showing the first rendering screen of the game
const totalNonVRBytesToDownload = 59498136;
// The 2 first assets to be downloaded
var appleBytesDownloaded = 0;
var backgroundBytesDownloaded = 0;

window.addEventListener('DOMContentLoaded', function () {
    var percentageDiv = document.getElementById("percentage");
    // get the canvas DOM element
    var canvas = document.getElementById('renderCanvas');

    // load the 3D engine
    var engine = new BABYLON.Engine(canvas, true);

    var scene;
    var apple, laserPointer;
    // used for particles effects
    var particleSystem, particleSystem2, particleSystem3;
    var particleSystemsIndex = 0;
    var emitter0, emitter1, emitter2;
    // Used for UI
    var touchedText, missedText, timeText, scoreText;
    // Used to compute the time elapsed during game
    var startTime, elapsedPausedTime, lastPausedTime;
    // Number of apples touched or missed
    var touchedNumber = 0;
    var missedNumber = 0;
    // Default time between 2 apples popping 
    var popTime = 2000;
    var particleSystems = [];
    var applesCollection = [];
    var emittersCollection = [];
    var gameStarted = false;
    var gamePaused = false;
    // References to the sounds used in game
    var music, AppleCrushedSound, fireSound;
    var intervalID1, intervalID2;
    var controllersIndex = 0;
    // References to the VR assets being used
    var leftLaserSaber, rightLaserSaber, leftController, rightController, leftBananaPistol, rightBananaPistol;
    // Used for UI configuration
    var scorePlane, menuAnchor, menuPanel, startButton, continueButton, stopButton;
    // VR specific logic
    var playVRWithLasers, playVRWithBananas;
    var playInVR = false;
    var vrPlayWithBananas = false;
    // Is the game ready to be started?
    var readyToStartGame = true;

    var gl;
    var baseMaterial;
    var pointers = [];
    var canvasRect;
    var currentGameplay;
    var index = 0;
    var ammosFired = [];

    // Various gameplays available
    var mouseGameplayOptions = { appleSize: 0.25, deltaXleft: -8, deltaXright: 8, deltaYdown: -0.8, deltaYup: 2.2, deltaZnear: 80, deltaZfar: 120, popTime: 2000, maxRibbonDistance: 0.12, ribbonThickness: 0.005 };
    var touchGameplayOptions = { appleSize: 0.3, deltaXleft: -8, deltaXright: 8, deltaYdown: -0.8, deltaYup: 2.2, deltaZnear: 80, deltaZfar: 120, popTime: 1500, maxRibbonDistance: 0.2, ribbonThickness: 0.01 };
    var penGameplayOptions = { appleSize: 0.25, deltaXleft: -8, deltaXright: 8, deltaYdown: -0.8, deltaYup: 2.2, deltaZnear: 80, deltaZfar: 120, popTime: 2000, maxRibbonDistance: 0.2, ribbonThickness: 0.005 };
    var vrGameplayLaserOptions = { appleSize: 0.078, deltaXleft: -1.7, deltaXright: 1.7, deltaYdown: -1, deltaYup: 0, deltaZnear: 100, deltaZfar: 140, popTime: 2000, maxRibbonDistance: 0.12, ribbonThickness: 0.005 };
    var vrGameplayBananaOptions = { appleSize: 0.16, deltaXleft: -1.7, deltaXright: 1.7, deltaYdown: -1, deltaYup: 0, deltaZnear: 100, deltaZfar: 140, popTime: 2000, maxRibbonDistance: 0.12, ribbonThickness: 0.005 };
    var accessibleGameplayOptions = { appleSize: 0.5 };

    switchGameplayTo(mouseGameplayOptions);

    var createScene = function () {
        // Requesting to use IndexedDB to store assets (geometries & textures) by checking .manifest files
        engine.enableOfflineSupport = true;
        scene = new BABYLON.Scene(engine);
        scene.clearColor = BABYLON.Color3.FromHexString("#1F2F3D");
        var freeCam = new BABYLON.FreeCamera("ImFree", new BABYLON.Vector3(0, 2, 0), scene);

        loadSounds(newRessourcedLoaded);
        importFruits(newRessourcedLoaded);
        importBackground(newRessourcedLoaded);

        var assetsReady = 0;
        var vrAssetsReady = 0;

        // Called each time a new ressource has been loaded by the async XHR
        function newRessourcedLoaded() {
            assetsReady++;

            // If the background, apple & apple crushed sound have been downloaded
            if (assetsReady === 3) {
                percentageDiv.parentNode.removeChild(percentageDiv);
                // Creating the various additionnal Babylon assets
                createSkyboxAndLight();
                createUI();
                createParticlesFX();

                // Glow effect that will be used for the light sword in VR
                gl = new BABYLON.GlowLayer("glow", scene, {
                    mainTextureFixedSize: 512
                });
                // To remove the loading screen
                document.body.className += ' loaded';
                // Used to check the type of pointer events triggered: mouse, touch or pen?
                canvas.addEventListener("pointerdown", detectPointerType);
                // If the browser supports VR, creating additionnal ressources and downloading remaining assets
                if (supportsVR) {
                    createAndSetupVRHelper();
                    importLaserSaber(newVRRessourceLoaded);
                    importBananaPistol(newVRRessourceLoaded);
                }
            }
        }

        // The light sword, banana gun & fire sound download will raise this callback
        function newVRRessourceLoaded() {
            vrAssetsReady++;
            if (vrAssetsReady === 3) {
                allVrAssetsReady = true;
            }
        }

        scene.onDispose = function () {
            disconnectTouchEvents();
        }

        return scene;
    };

    function updateDownloadProgress() {
        percentageDiv.innerHTML = Math.floor((appleBytesDownloaded + backgroundBytesDownloaded) / totalNonVRBytesToDownload * 100) + "%";
    }

    function getRandomArbitrary(min, max) {
        return Math.random() * (max - min) + min;
    }

    // Resetting the position of the apple using random numbers based on the current gameplay used
    function resetApplePosition(appleItem) {
        var sign = 1;
        appleItem.position.x = getRandomArbitrary(currentGameplay.deltaXleft, currentGameplay.deltaXright);
        if (appleItem.position.x < 0) sign = -1;
        appleItem.position.y = getRandomArbitrary(currentGameplay.deltaYdown, currentGameplay.deltaYup);
        appleItem.position.z = getRandomArbitrary(currentGameplay.deltaZnear, currentGameplay.deltaZfar);
        // Tangent forces applied to have curved trajectories for the apples
        var tangentForceX = getRandomArbitrary(0, 40);
        var tangentForceY = getRandomArbitrary(-20, 20);
        appleItem.startPoint = new BABYLON.Vector3(appleItem.position.x, appleItem.position.y, 0);
        appleItem.startTangent = new BABYLON.Vector3(sign * tangentForceX, tangentForceY, 0);
        appleItem.endPoint = new BABYLON.Vector3(appleItem.position.x, appleItem.position.y, appleItem.position.z);
        appleItem.endTangent = new BABYLON.Vector3(sign * -tangentForceX, -tangentForceY, 0);
    }

    function connectTouchEvents() {
        canvas.addEventListener("pointerdown", startDrawingRibbon);
        canvas.addEventListener("pointermove", continueDrawingRibbon);
        canvas.addEventListener("pointerup", stopDrawingRibbon);
        canvas.addEventListener("pointerout", stopDrawingRibbon);
    }

    function disconnectTouchEvents() {
        canvas.removeEventListener("pointerdown", startDrawingRibbon);
        canvas.removeEventListener("pointermove", continueDrawingRibbon);
        canvas.removeEventListener("pointerup", stopDrawingRibbon);
        canvas.removeEventListener("pointerout", stopDrawingRibbon);
    }

    // Switching gameplay values based on input mode
    function detectPointerType(event) {
        if (!playInVR) {
            switch (event.pointerType) {
                case "mouse":
                    switchGameplayTo(mouseGameplayOptions);
                    break;
                case "touch":
                    switchGameplayTo(touchGameplayOptions);
                    break;
                case "pen":
                    switchGameplayTo(penGameplayOptions);
                    break;
            }
        }
    }

    function switchGameplayTo(newGameplay) {
        currentGameplay = newGameplay;
    }

    function startGame() {
        // Resetting all Apples properties based on current gameplay being used (position & sizes)
        applesCollection.forEach((appleItem) => {
            resetApplePosition(appleItem);
            appleItem.scaling.x = currentGameplay.appleSize;
            appleItem.scaling.y = currentGameplay.appleSize;
            appleItem.scaling.z = currentGameplay.appleSize;
        });

        gameStarted = true;
        gamePaused = false;
        // Updating UI
        scorePlane.setEnabled(false);
        menuAnchor.setEnabled(false);
        if (playInVR) {
            menuPanel.removeControl(playVRWithBananas);
            menuPanel.removeControl(playVRWithLasers);
        }
        else {
            menuPanel.removeControl(startButton);
        }
        menuPanel.addControl(continueButton);
        menuPanel.addControl(stopButton);

        music.setPlaybackRate(1.075);
        music.play();
        music.setVolume(0.5, 0.1);
        startTime = new Date().getTime();
        elapsedPausedTime = 0;

        // In VR, we're going to remove the default model of the controllers to put a banana gun or light sword instead
        switchControllersModelsToGameMode();

        // Resetting scores
        missedNumber = 0;
        touchedNumber = 0;
        touchedText.text = "Touched  0";
        missedText.text = "Missed  0";
        // At the beginning a new apple will pop every 2s
        popTime = currentGameplay.popTime;

        connectTouchEvents();
        scene.registerBeforeRender(gameRenderLoop);
        intervalID1 = window.setTimeout(displayNewApple, popTime);
        intervalID2 = window.setTimeout(checkGameTime, 250);
    }

    function stopGame() {
        gameStarted = false;
        disconnectTouchEvents();
        scene.unregisterBeforeRender(gameRenderLoop);
        window.clearTimeout(intervalID1);
        window.clearInterval(intervalID2);

        var diffNumb = touchedNumber - missedNumber;
        var score = 0;

        if (diffNumb > 0) {
            score = diffNumb * 100;
        }

        scorePlane.setEnabled(true);
        scoreText.text = "Score: " + score;

        gameStarted = false;
        if (gamePaused) {
            gamePaused = false;
            music.play();
            music.stop();
        }
        else {
            music.setVolume(0, 1.5);
            music.stop(1.5);
        }

        // Cleaning screen to remove potential remaining 3d objects
        applesCollection.forEach((appleItem) => {
            appleItem.isVisible = false;
        });

        ammosFired.forEach((ammo) => {
            ammo.dispose();
        });

        ammosFired = [];

        // Cleaning potential remaining ribbons
        for (pointer in pointers) {
            if (pointers[pointer]) {
                stopDrawingRibbon({ pointerId: pointers[pointer].pointerId });
            }
        }
        pointers = [];
        // Managing UI
        menuPanel.removeControl(continueButton);
        menuPanel.removeControl(stopButton);
        menuPanel.addControl(startButton);
        menuAnchor.setEnabled(true);
        timeText.text = "1:00";
        switchControllersModelsToDefault();
    }

    function pauseGame() {
        disconnectTouchEvents();
        window.clearTimeout(intervalID1);
        music.setVolume(0, 0.3);
        window.setTimeout(function () {
            lastPausedTime = new Date().getTime();
            music.pause();
            gamePaused = true;
            menuAnchor.setEnabled(true);
        }, 300);
        switchControllersModelsToDefault();
    }

    function continueGame() {
        connectTouchEvents();
        timePaused = new Date().getTime() - lastPausedTime;
        elapsedPausedTime += timePaused;
        music.setVolume(0.5, 0.5);
        music.play();
        menuAnchor.setEnabled(false);
        gamePaused = false;
        switchControllersModelsToGameMode();
        intervalID1 = window.setTimeout(displayNewApple, 300);
    }

    // Configuring UI to let the user choose between the banana gun or light sword mode
    function chooseVRMode() {
        menuPanel.removeControl(startButton);
        menuPanel.addControl(playVRWithLasers);
        menuPanel.addControl(playVRWithBananas);
    }

    function gameRenderLoop() {
        // Moving apples relative to the current fps to have a consistant speed
        var fpsFactor = 15 / engine.getFps();
        if (apple && gameStarted && !gamePaused) {
            // If there's some ammos fired from the banana guns
            ammosFired.forEach((ammo) => {
                // If the ammo is too far away, removing it from the scene and collection
                if (ammo.ammoDistance > 200) {
                    var index = ammosFired.indexOf(ammo);
                    if (index !== -1) {
                        ammosFired.splice(index, 1);
                    }
                    ammo.dispose();
                }
                // Otherwise moving it forward
                else {
                    ammo.ammoDistance *= 1.125;
                    ammo.locallyTranslate(new BABYLON.Vector3(0, 0, ammo.ammoDistance));
                    castRay(ammo);
                }
            });
            // If an apple is activated (visible) 
            // moving it toward the player
            applesCollection.forEach((appleItem) => {
                if (appleItem.isVisible) {
                    appleItem.rotation.y += fpsFactor / 5;
                    appleItem.rotation.x += fpsFactor / 5;
                    appleItem.position.z -= fpsFactor * 2;
                    // Computing position based on tangents for the curved trajectories
                    var computePosition = BABYLON.Vector3.Hermite(appleItem.startPoint, appleItem.startTangent,
                        appleItem.endPoint, appleItem.endTangent, appleItem.position.z / appleItem.endPoint.z);
                    appleItem.position.x = computePosition.x;
                    appleItem.position.y = computePosition.y;

                    // The apple is behind you, you've missed it!
                    if (appleItem.position.z <= -1) {
                        missedNumber++;
                        missedText.text = "Missed  " + missedNumber;
                        resetApplePosition(appleItem);
                        appleItem.isVisible = false;
                    }
                }
            });
        }
    }

    function vecToLocal(vector, mesh) {
        var m = mesh.getWorldMatrix();
        var v = BABYLON.Vector3.TransformCoordinates(vector, m);
        return v;
    }

    // Casting a ray in front of the ammo to check if we're about to touch an apple
    function castRay(ammo) {
        var origin = ammo.position;

        var forward = new BABYLON.Vector3(0, 0, 1);
        forward = vecToLocal(forward, ammo);

        var direction = forward.subtract(origin);
        direction = BABYLON.Vector3.Normalize(direction);

        var length = 2;

        var ray = new BABYLON.Ray(origin, direction, length);

        var hit = scene.pickWithRay(ray, (mesh) => {
            if (mesh.name.indexOf('apple') !== -1) {
                return true;
            }
            else {
                return false;
            }
        });

        if (hit.pickedMesh) {
            var evt = {};
            evt.additionalData = hit.pickedMesh;
            collisionHandler(evt);
        }
    }

    // Checking if a new apple is available to be activated
    function displayNewApple() {
        if (gameStarted && !gamePaused) {
            for (var i = 0; i < applesCollection.length; i++) {
                if (!applesCollection[i].isVisible) {
                    applesCollection[i].isVisible = true;
                    break;
                }
            }
        }
        intervalID1 = window.setTimeout(displayNewApple, popTime);
    }

    // Managing countdown
    function checkGameTime() {
        if (gameStarted && !gamePaused) {
            var now = new Date().getTime() - elapsedPausedTime;
            var distance = now - startTime;
            if (distance < 60 * 1000) {
                var seconds = Math.floor((distance % (1000 * 60)) / 1000);
                var remainingSec = 59 - seconds;
                var timeLeft = "0:" + ("0" + remainingSec).slice(-2);
                timeText.text = timeLeft;
                // The apples are displayed faster and faster based on the current remaing gaming time
                if (seconds > 15 && seconds < 30) {
                    popTime = currentGameplay.popTime * 3 / 4;
                }
                if (seconds > 30 && seconds < 40) {
                    popTime = currentGameplay.popTime / 2;
                }
                if (seconds > 40 && seconds < 50) {
                    popTime = currentGameplay.popTime * 3 / 8;
                }
                if (seconds > 50) {
                    popTime = currentGameplay.popTime / 4;
                }
            }
            else {
                stopGame();
            }
            intervalID2 = window.setTimeout(checkGameTime, 250)
        }
    }

    function recomputePivotPoint(mesh) {
        var boundingCenter = mesh.getBoundingInfo().boundingSphere.center;
        mesh.setPivotMatrix(BABYLON.Matrix.Translation(-boundingCenter.x, -boundingCenter.y, -boundingCenter.z));
    }

    function importFruits(done) {
        // Using the glTF model imported from: https://www.remix3d.com/details/G009SX0N139P?section=remixes
        // Thanks to Paint3D
        BABYLON.SceneLoader.ImportMesh("", "./assets/", "Apple.glb", scene, function (newMeshes) {
            var appleChild = newMeshes[0].getChildMeshes();

            for (var i = 0; i < appleChild.length; i++) {
                if (appleChild[i].id === "mesh_id28") {
                    apple = appleChild[i];
                    recomputePivotPoint(apple);
                    apple.isVisible = false;
                    apple.setEnabled(false);
                    break;
                }
            }

            for (var index = 0; index < 10; index++) {
                var appleItem = apple.createInstance("apple" + index);
                appleItem.isVisible = false;
                applesCollection.push(appleItem);
            }

            if (done) {
                done();
            }
        }, (event) => {
            appleBytesDownloaded = event.loaded;
            updateDownloadProgress();
            });
    }

    function importBackground(done) {
        BABYLON.SceneLoader.ImportMesh("", "./assets/", "ApplesCrusherBackground.glb", scene, function (newMeshes) {
            var island = newMeshes[0].getChildMeshes()[0];
            island.isPickable = false;
            island.scaling.x = 60;
            island.scaling.y = 60;
            island.scaling.z = 60;
            island.rotation.y = Math.PI;
            island.position.z = 32;
            island.position.y = -2;
            island.position.x = -1;

            var cloud1 = island.getChildMeshes(true, (node) => { return node.id === "node_id57" })[0];
            var cloud2 = island.getChildMeshes(true, (node) => { return node.id === "node_id63" })[0];
            var cloud3 = island.getChildMeshes(true, (node) => { return node.id === "node_id49" })[0];
            var cloud4 = island.getChildMeshes(true, (node) => { return node.id === "node_id61" })[0];

            cloud1.position.y = 0.15;
            cloud1.position.z = -0.3;
            cloud1.isPickable = false;
            cloud2.position.y = 0.2;
            cloud2.position.z = -0.35;
            cloud2.isPickable = false;
            cloud3.position.z = 0;
            cloud3.isPickable = false;
            cloud4.position.z = -0.2;
            cloud4.isPickable = false;
            createCloudAnimation(cloud1, { frame: 1200, x: -0.5 }, { frame: 2500, x: 0.5 }, 3000);
            createCloudAnimation(cloud2, { frame: 800, x: 0.6 }, { frame: 1800, x: -0.6 }, 2800);
            createCloudAnimation(cloud3, { frame: 300, x: -0.35 }, { frame: 1500, x: 0.35 }, 2400);
            createCloudAnimation(cloud4, { frame: 200, x: 0.4 }, { frame: 1000, x: -0.4 }, 2000);

            if (done) {
                done();
            }
        }, (event) => {
            backgroundBytesDownloaded = event.loaded;
            updateDownloadProgress();
        });
    }

    function createCloudAnimation(cloud, first, second, lastFrame) {
        var animationCloud = new BABYLON.Animation("cloudEasingAnimation", "position.x", 30, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);

        var keysCloud = [];
        keysCloud.push({ frame: 0, value: cloud.position.x });
        keysCloud.push({ frame: first.frame, value: first.x });
        keysCloud.push({ frame: second.frame, value: second.x });
        keysCloud.push({ frame: lastFrame, value: cloud.position.x });
        animationCloud.setKeys(keysCloud);

        var easingFunction = new BABYLON.PowerEase();
        easingFunction.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEINOUT);

        animationCloud.setEasingFunction(easingFunction);
        cloud.animations.push(animationCloud);
        scene.beginAnimation(cloud, 0, lastFrame, true);
    }

    function importLaserSaber(done) {
        // Using the glTF model imported from: https://www.remix3d.com/details/G009SWQ4DT9P
        // Thanks to Paint3D
        BABYLON.SceneLoader.ImportMesh("", "./assets/", "lasersaber.glb", scene, function (newMeshes) {
            var laserSaber = new BABYLON.Mesh(scene);
            laserSaber.name = "laserSaber1";

            var meshChildren = newMeshes[0].getChildMeshes();

            // Rotating & moving the laser saber to match VR controller pos
            newMeshes[0].rotation.x = Math.PI / 2;
            newMeshes[0].position.y -= 0.26;
            newMeshes[0].position.z -= 0.2;

            for (var i = 0; i < meshChildren.length; i++) {
                // looking for the laser itself to scale it a little bit
                if (meshChildren[i].id === "mesh_id37") {
                    meshChildren[i].scaling.y *= 2.2;
                    meshChildren[i].position.y += 120;
                    meshChildren[i].material.emissiveColor = BABYLON.Color3.White();
                    break;
                }
            }

            laserSaber.addChild(newMeshes[0]);
            laserSaber.scaling.x *= 1.3;
            laserSaber.scaling.y *= 1.3;
            laserSaber.scaling.z *= 1.3;

            laserSaber.setEnabled(false);

            leftLaserSaber = laserSaber;
            rightLaserSaber = laserSaber.clone("laserSaber2");
            rightLaserSaber.setEnabled(false);

            if (done) {
                done();
            }
        });
    }

    function importBananaPistol(done) {
        // Using the glTF model imported from: https://www.remix3d.com/details/G009SX4C7XK1
        BABYLON.SceneLoader.ImportMesh("", "//david.blob.core.windows.net/applescrushervr/assets/", "bananapistolwithammo.glb", scene, function (newMeshes) {
            var bananaPistol = new BABYLON.Mesh(scene);
            bananaPistol.name = "bananaPistol1";

            newMeshes[0].rotation.x = 0;
            newMeshes[0].rotation.y = Math.PI;
            newMeshes[0].position.z += 0.2;

            bananaPistol.addChild(newMeshes[0]);
            bananaPistol.scaling.x *= 0.5;
            bananaPistol.scaling.y *= 0.5;
            bananaPistol.scaling.z *= 0.5;

            var ammo = bananaPistol.getChildMeshes(false, (node) => { return node.id === "node_id34" })[0];
            ammo.isVisible = false;
            bananaPistol.setEnabled(false);

            leftBananaPistol = bananaPistol;
            rightBananaPistol = bananaPistol.clone("bananaPistol2");
            rightBananaPistol.setEnabled(false);

            if (done) {
                done();
            }
        });

        fireSound = new BABYLON.Sound("fire", "./assets/186950__readeonly__toy-cannon-shot.wav", scene, done);
    }

    function createAndSetupVRHelper() {
        // The cool new feature of 3.1
        // Check the doc: http://doc.babylonjs.com/how_to/webvr_helper
        // Or my tutorial on the VRHelper: https://www.davrous.com/2017/12/22/babylon-js-vrexperiencehelper-create-fully-interactive-webvr-apps-in-2-lines-of-code/
        VRHelper = scene.createDefaultVRExperience({ createFallbackVRDeviceOrientationFreeCamera: false, useCustomVRButton: true });
        scene.activeCamera.detachControl(canvas);
        VRHelper.enableInteractions();
        // To automatically enter VR in Supermedium browser
        window.addEventListener('vrdisplayactivate', function () {
            console.log("vrdisplayactivate event triggered.");
            VRHelper.enterVR();
        });
        VRHelper.onControllerMeshLoaded.add(function (webVRController) {
            var laserSaber;
            // To know if we should fire or not based on the triggering level
            var _padSensibilityUp = 0.65;
            var _padSensibilityDown = 0.35;
            var fireAsked = false;
            if (webVRController.hand === "left") {
                leftController = webVRController;
                laserSaber = leftLaserSaber;
            }
            else {
                rightController = webVRController;
                laserSaber = rightLaserSaber;
            }

            var meshChildren = laserSaber.getChildMeshes();
            // Getting the real laser to act as the collider against apples
            laserSaber = meshChildren[12];

            // Using the beauty of the action manager to detect
            // One of the laser saber has touched an apple
            laserSaber.actionManager = new BABYLON.ActionManager(scene);
            applesCollection.forEach((appleItem) => {
                laserSaber.actionManager.registerAction(new BABYLON.ExecuteCodeAction({
                    trigger: BABYLON.ActionManager.OnIntersectionEnterTrigger, parameter: appleItem
                }, collisionHandler));
            });

            webVRController.onSecondaryButtonStateChangedObservable.add(function (stateObject) {
                if (gameStarted && stateObject.value === 1 && !gamePaused) {
                    pauseGame();
                }
            });

            // In Banana gun VR mode, we can fire some ammos using the trigger
            webVRController.onTriggerStateChangedObservable.add((stateObject) => {
                if (vrPlayWithBananas && gameStarted && !gamePaused && !fireAsked) {
                    if (stateObject.value > _padSensibilityUp) {
                        fireAsked = true;
                        var fireSoundCloned = fireSound.clone();
                        fireSoundCloned.play();
                        fireNewAmmo(webVRController);
                    }
                } else if (stateObject.value < _padSensibilityDown) {
                    fireAsked = false;
                }
            });
        });

        // If we're firing an ammo from the banana gun
        function fireNewAmmo(fromController) {
            var model;
            if (fromController.hand === "left") {
                model = leftController.mesh;
            }
            else {
                model = rightController.mesh;
            }
            index++;
            // Getting the position of the ammo on the current controller used
            var ammo = model.getChildMeshes(false, (node) => { return node.id.indexOf("node_id34") !== -1 })[0];
            // cloning the ammo
            var newAmmo = ammo.clone("ammo" + index);
            // Trick to place and rotate the cloned ammo exactly at the same area as the hidden ammo attached to the banana gun model
            newAmmo.parent = ammo.parent;
            // releasing it from the parent, it's time to live your own life!
            newAmmo.setParent(null);
            newAmmo.position = ammo.getAbsolutePosition().clone();
            newAmmo.isVisible = true;
            newAmmo.ammoDistance = 0.15;
            ammosFired.push(newAmmo);
        }
        // Only testing ray selection on mesh visible or enabled
        VRHelper.raySelectionPredicate = function (mesh) {
            if (mesh.isVisible === false || mesh.isEnabled() === false) {
                return false;
            }
            return true;
        };
        // If you're leaving the immersive mode in VR to go back to the desktop
        VRHelper.onExitingVR.add(function (value) {
            readyToStartGame = false;
            startButton.text = "Play in VR";
        });
        VRHelper.onEnteringVR.add(() => {
            VRHelper.position.y = 2;
            VRHelper.position.x = 0;
            VRHelper.position.z = 0;
        });
        // If the user plugs/unplugs his HMD
        scene.getEngine().onVRDisplayChangedObservable.add(function (eventData) {
            // A new VR headset has been plugged, offering the VR mode
            if (eventData.vrDisplay && eventData.vrDisplay.isConnected) {
                readyToStartGame = false;
                function checkVRisReady() {
                    if (allVrAssetsReady) {
                        startButton.text = "Play in VR";
                        playInVR = true;
                    }
                    // The assets are not yet ready, waiting for the download to finish
                    else {
                        startButton.text = "Downloading VR...";
                        window.setTimeout(checkVRisReady, 500);
                    }
                }
                checkVRisReady();
            }
            // The VR headset has been disconnected, switching back to non VR mode
            else {
                playInVR = false;
                readyToStartGame = true;
                startButton.text = "Play";
                switchGameplayTo(mouseGameplayOptions);
                scene.activeCamera.detachControl(canvas);
            }
        });

        // WebVR has finished projecting the rendering into the headset, we're good to go
        scene.getEngine().onVRRequestPresentComplete.add(function (success) {
            if (success) {
                console.log("VR Ready.");
                readyToStartGame = true;
            }
        });
    }

    // Attaching back to default model of your current VR controllers
    function switchControllersModelsToDefault() {
        if (supportsVR) {
            if (leftController) {
                leftController.mesh.setEnabled(false);
                leftController.attachToMesh(leftController.defaultModel);
                leftController.mesh.setEnabled(true);
            }
            if (rightController) {
                rightController.mesh.setEnabled(false);
                rightController.attachToMesh(rightController.defaultModel);
                rightController.mesh.setEnabled(true);
            }
            VRHelper.displayGaze = true;
            VRHelper.displayLaserPointer = true;
        }
    }

    // Attaching a laser saber or a banana gun on each of your VR controller available
    function switchControllersModelsToGameMode() {
        if (supportsVR) {
            if (leftController) {
                leftController.mesh.setEnabled(false);
                if (vrPlayWithBananas) {
                    leftController.attachToMesh(leftBananaPistol);
                }
                else {
                    leftController.attachToMesh(leftLaserSaber);
                }
                leftController.mesh.setEnabled(true);
            }
            if (rightController) {
                rightController.mesh.setEnabled(false);
                if (vrPlayWithBananas) {
                    rightController.attachToMesh(rightBananaPistol);
                }
                else {
                    rightController.attachToMesh(rightLaserSaber);
                }
                rightController.mesh.setEnabled(true);
            }
            VRHelper.displayGaze = false;
            VRHelper.displayLaserPointer = false;
        }
    }

    // Using BABYLON.GUI UI layer to build interface for VR interactions
    // More on GUI in the doc: http://doc.babylonjs.com/how_to/gui
    // More on GUI3D in the doc: http://doc.babylonjs.com/how_to/gui3d
    function createUI() {
        menuAnchor = new BABYLON.AbstractMesh("menuAnchor", scene);
        menuAnchor.position.y = 2;
        menuAnchor.position.z = 5;
        menuAnchor.rotation.x = -0.35;

        var manager = new BABYLON.GUI.GUI3DManager(scene);
        menuPanel = new BABYLON.GUI.StackPanel3D();
        menuPanel.margin = 0.02;

        manager.addControl(menuPanel);
        menuPanel.linkToTransformNode(menuAnchor);

        // reset button
        startButton = new BABYLON.GUI.HolographicButton("play");
        startButton.text = "Play";
        menuPanel.addControl(startButton);
        startButton.onPointerClickObservable.add(function (event) {
            // game is ready to be played in 2 scenarios: you're currently inside the headset or you're not playing in VR
            if (readyToStartGame) {
                // in VR you need to choose your weapon
                if (playInVR) {
                    chooseVRMode();
                }
                else {
                    startGame();
                }
                return;
            }
            // you're not yet inside the VR headset, we need first to enter the Oasis
            if (playInVR) {
                startButton.text = "Start";
                VRHelper.enterVR();
            }
        });

        continueButton = new BABYLON.GUI.HolographicButton("continueButton");
        continueButton.text = "Continue";
        continueButton.onPointerClickObservable.add(function () {
            continueGame();
        });

        stopButton = new BABYLON.GUI.HolographicButton("stopButton");
        stopButton.text = "Stop";
        stopButton.onPointerClickObservable.add(function () {
            stopGame();
        });

        playVRWithLasers = new BABYLON.GUI.HolographicButton("playVRWithLasers");
        playVRWithLasers.text = "Light Swords";
        playVRWithLasers.onPointerClickObservable.add(function () {
            vrPlayWithBananas = false;
            switchGameplayTo(vrGameplayLaserOptions);
            startGame();
        });

        playVRWithBananas = new BABYLON.GUI.HolographicButton("playVRWithBananas");
        playVRWithBananas.text = "Banana Guns";
        playVRWithBananas.onPointerClickObservable.add(function () {
            vrPlayWithBananas = true;
            switchGameplayTo(vrGameplayBananaOptions);
            startGame();
        });

        // Number of apples crushed, displayed top left
        var touchedTexture = createGUITexture("touchedApples", 1.5, new BABYLON.Vector3(-2, 5.5, 10)).GUITexture;
        touchedText = createText("Touched 0", "green");
        touchedTexture.addControl(touchedText);

        // Number of apples missed, displayed top right
        var missedTexture = createGUITexture("missedApples", 1.5, new BABYLON.Vector3(2, 5.5, 10)).GUITexture;
        missedText = createText("Missed  0", "red");
        missedTexture.addControl(missedText);

        // Countdown
        var timeTexture = createGUITexture("timePlane", 1, new BABYLON.Vector3(0, 0.5, 5)).GUITexture;
        timeText = createText("1:00", "white");
        timeTexture.addControl(timeText);

        // Score
        var score = createGUITexture("scorePlane", 1, new BABYLON.Vector3(0, 3, 5));
        scorePlane = score.plane;
        var scoreTexture = score.GUITexture;
        scoreText = createText("", "white");
        scoreTexture.addControl(scoreText);
        scorePlane.setEnabled(false);

        // base material for the ribbons
        baseMaterial = new BABYLON.StandardMaterial("baseMaterial", scene);
        baseMaterial.alpha = 1.0;
        baseMaterial.diffuseColor = new BABYLON.Color3(1, 0.8, 0.1);
        baseMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        baseMaterial.backFaceCulling = false;
    }

    function createGUITexture(planeName, planeSize, planePosition) {
        var plane = BABYLON.Mesh.CreatePlane(planeName, planeSize, scene);
        plane.position = planePosition;
        var GUITexture = BABYLON.GUI.AdvancedDynamicTexture.CreateForMesh(plane);
        return { GUITexture: GUITexture, plane: plane };
    }

    function createText(text, color) {
        var GUIText = new BABYLON.GUI.TextBlock();
        GUIText.text = text;
        GUIText.color = color;
        GUIText.fontSize = 250;
        GUIText.textWrapping = true;
        return GUIText;
    }

    // Creating particles effect when you'll crush an apple
    // Using 3 emitters and particle systems we'll positionnate on the Apples touched
    // samples extracted from: http://doc.babylonjs.com/babylon101/particles
    function createParticlesFX() {
        // Emitters
        for (var i = 0; i < 3; i++) {
            emittersCollection.push(BABYLON.Mesh.CreateBox("emitter" + i, 0.1, scene));
            emittersCollection[i].isVisible = false;
        }

        // Custom shader for particles
        BABYLON.Effect.ShadersStore["myParticleFragmentShader"] =
            "#ifdef GL_ES\n" +
            "precision highp float;\n" +
            "#endif\n" +

            "varying vec2 vUV;\n" +                     // Provided by babylon.js
            "varying vec4 vColor;\n" +                  // Provided by babylon.js

            "uniform sampler2D diffuseSampler;\n" +     // Provided by babylon.js
            "uniform float time;\n" +                   // This one is custom so we need to declare it to the effect

            "void main(void) {\n" +
            "vec2 position = vUV;\n" +

            "float color = 0.0;\n" +
            "vec2 center = vec2(0.5, 0.5);\n" +

            "color = sin(distance(position, center) * 10.0+ time * vColor.g);\n" +

            "vec4 baseColor = texture2D(diffuseSampler, vUV);\n" +

            "gl_FragColor = baseColor * vColor * vec4( vec3(color, color, color), 1.0 );\n" +
            "}\n" +
            "";

        // Effect
        var effect = engine.createEffectForParticles("myParticle", ["time"]);

        // Particles
        particleSystem = new BABYLON.ParticleSystem("particles", 4000, scene, effect);
        particleSystem.particleTexture = new BABYLON.Texture("textures/flare.png", scene);
        particleSystem.minSize = 0.1;
        particleSystem.maxSize = 1.0;
        particleSystem.minLifeTime = 0.5;
        particleSystem.maxLifeTime = 5.0;
        particleSystem.minEmitPower = 0.5;
        particleSystem.maxEmitPower = 3.0;
        particleSystem.emitter = emittersCollection[0];
        particleSystem.emitRate = 100;
        particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_ONEONE;
        particleSystem.direction1 = new BABYLON.Vector3(-1, 1, -1);
        particleSystem.direction2 = new BABYLON.Vector3(1, 1, 1);
        particleSystem.color1 = new BABYLON.Color4(1, 1, 0, 1);
        particleSystem.color2 = new BABYLON.Color4(1, 0.5, 0, 1);
        particleSystem.gravity = new BABYLON.Vector3(0, -1.0, 0);

        particleSystem2 = particleSystem.clone();
        particleSystem2.emitter = emittersCollection[1];
        particleSystem2.color1 = new BABYLON.Color4(1, 0, 0, 1);
        particleSystem2.color2 = new BABYLON.Color4(1, 0.5, 0, 1);
        particleSystem3 = particleSystem.clone();
        particleSystem3.emitter = emittersCollection[2];
        particleSystem3.color1 = new BABYLON.Color4(0, 0, 1, 1);
        particleSystem3.color2 = new BABYLON.Color4(1, 0.5, 0, 1);

        particleSystems.push(particleSystem);
        particleSystems.push(particleSystem2);
        particleSystems.push(particleSystem3);

        particleSystem.stop();
        particleSystem2.stop();
        particleSystem3.stop();

        var time = 0;
        var order = 0.1;

        effect.onBind = function () {
            effect.setFloat("time", time);

            time += order;

            if (time > 100 || time < 0) {
                order *= -1;
            }
        };
    }

    // Using Babylon.js Audio Engine: http://doc.babylonjs.com/how_to/playing_sounds_and_music 
    function loadSounds(done) {
        AppleCrushedSound = new BABYLON.Sound("AppleCrushed", "./assets/AppleCrushed.wav", scene, done);
        // Music done by David Rousset: https://soundcloud.com/david-rousset
        music = new BABYLON.Sound("music", "./assets/RunningForGlory.mp3", scene, null, { volume: 0.5, autoplay: false, streaming: true });
    }

    // When a laser saber has touched an apple
    var collisionHandler = function (evt) {
        touchedNumber++;
        touchedText.text = "Touched " + touchedNumber;
        AppleCrushedSound.play();
        // Getting the right emitter and particle system 
        var emitter = emittersCollection[particleSystemsIndex % 3];
        var particleSystem = particleSystems[particleSystemsIndex % 3];

        // Moving the particles emitter right where you've crush the apple
        emitter.position.copyFrom(evt.additionalData.absolutePosition);
        particleSystem.start();
        window.setTimeout(function () {
            particleSystem.stop();
        }, 500);
        // Putting back this apple in the waiting list
        evt.additionalData.isVisible = false;
        resetApplePosition(evt.additionalData);
        particleSystemsIndex++;
    };

    function createSkyboxAndLight() {
        // Define a general environment texture
        var hdrTexture = BABYLON.CubeTexture.CreateFromPrefilteredData("textures/environment.dds", scene);
        scene.environmentTexture = hdrTexture;

        // Let's create a color curve to play with background color
        var curve = new BABYLON.ColorCurves();
        curve.globalHue = 200;
        curve.globalDensity = 100;

        var box = scene.createDefaultSkybox(hdrTexture, true, 200, 0.7);
        box.infiniteDistance = false;
        box.material.imageProcessingConfiguration = new BABYLON.ImageProcessingConfiguration();
        box.material.cameraColorCurvesEnabled = true;
        box.material.cameraColorCurves = curve;
        box.name = "MYMESHFORSKYBOX";

        var light = new BABYLON.DirectionalLight('light', new BABYLON.Vector3(-0.2, -1, 0), scene);
        light.position = new BABYLON.Vector3(100 * 0.2, 100 * 2, 0);
        light.intensity = 4.5;
    }

    // use ESC to pause the game using keyboard
    document.addEventListener("keydown", function (evt) {
        if (evt.keyCode === 27) {
            pauseGame();
        }
    });

    function pushCoordinatesToPaths(pointer) {
        pointer.path1.push(new BABYLON.Vector3(pointer.firstCoordinates.x, pointer.firstCoordinates.y - currentGameplay.ribbonThickness, pointer.firstCoordinates.z));
        pointer.path2.push(new BABYLON.Vector3(pointer.firstCoordinates.x, pointer.firstCoordinates.y + currentGameplay.ribbonThickness, pointer.firstCoordinates.z));
        pointer.path1.push(new BABYLON.Vector3(pointer.secondCoordinates.x, pointer.secondCoordinates.y - currentGameplay.ribbonThickness, pointer.secondCoordinates.z));
        pointer.path2.push(new BABYLON.Vector3(pointer.secondCoordinates.x, pointer.secondCoordinates.y + currentGameplay.ribbonThickness, pointer.secondCoordinates.z));
    }

    function startDrawingRibbon(event) {
        if (gameStarted && !gamePaused) {
            canvasRect = engine.getRenderingCanvasClientRect();
            currentPointerX = event.clientX - canvasRect.left;
            currentPointerY = event.clientY - canvasRect.top;
            var ribbonMat = baseMaterial.clone();
            pointers[event.pointerId] = {
                pointerId: event.pointerId,
                pointerIsDown: true,
                path1: [],
                path2: [],
                ribbons: [],
                firstCoordinates: convertScreenCoordinatesToWorld({ x: currentPointerX, y: currentPointerY }),
                material: ribbonMat,
                ribbonDistance: 0
            }
            testApplesCollisionAround(currentPointerX, currentPointerY);
        }
    }

    var currentPointerX, currentPointerY, previousPointerX, previousPointerY;

    function continueDrawingRibbon(event) {
        previousPointerX = currentPointerX;
        previousPointerY = currentPointerY;
        var distance;
        var pointer = pointers[event.pointerId];
        if (pointer && pointer.pointerIsDown) {
            currentPointerX = event.clientX - canvasRect.left;
            currentPointerY = event.clientY - canvasRect.top;
            pointer.secondCoordinates = convertScreenCoordinatesToWorld({ x: currentPointerX, y: currentPointerY });
            pushCoordinatesToPaths(pointer);
            distance = computeDistance(pointer.firstCoordinates, pointer.secondCoordinates);
            testApplesCollisionBetween({ x: previousPointerX, y: previousPointerY }, { x: currentPointerX, y: currentPointerY }, distance);
            pointer.firstCoordinates = pointer.secondCoordinates;
            var ribbon = BABYLON.MeshBuilder.CreateRibbon("ribbon", { pathArray: [pointer.path1, pointer.path2] }, scene);
            ribbon.isPickable = false;
            ribbon.material = pointer.material;
            pointer.ribbons.push(ribbon);
            pointer.path1 = [];
            pointer.path2 = [];
            pointer.ribbonDistance += distance;
            if (pointer.ribbonDistance > currentGameplay.maxRibbonDistance) {
                stopDrawingRibbon(event);
            }
        }
    }

    function computeDistance(p1, p2) {
        return Math.sqrt((p1.x - p2.x) * (p1.x - p2.x) + (p1.y - p2.y) * (p1.y - p2.y));
    }

    function stopDrawingRibbon(event) {
        var pointer = pointers[event.pointerId];
        if (pointer && pointer.pointerIsDown && pointer.ribbons.length > 0) {
            var mergedRibbon = BABYLON.Mesh.MergeMeshes(pointer.ribbons, true);
            mergedRibbon.isPickable = false;
            createRibbonAnimation(mergedRibbon);
            pointer.ribbons = [];
            scene.beginAnimation(mergedRibbon, 0, 30, false, 2, () => {
                mergedRibbon.dispose();
            });
        }
        if (pointer) {
            pointer.pointerIsDown = false;
        }
    }

    function createRibbonAnimation(ribbon) {
        var ribbonAnimation = new BABYLON.Animation("ribbonAnimation", "material.alpha", 30, BABYLON.Animation.ANIMATIONTYPE_FLOAT,
            BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        var keys = [];
        keys.push({
            frame: 0,
            value: 1
        });
        keys.push({
            frame: 30,
            value: 0
        });

        ribbonAnimation.setKeys(keys);
        ribbon.animations.push(ribbonAnimation);
    }

    function convertScreenCoordinatesToWorld(coordinates) {
        var x = coordinates.x;
        var y = coordinates.y;
        var cameraViewport = scene.activeCamera.viewport;
        var viewport = cameraViewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

        // Moving coordinates to local viewport world
        x = x / engine.getHardwareScalingLevel() - viewport.x;
        y = y / engine.getHardwareScalingLevel() - (engine.getRenderHeight() - viewport.y - viewport.height);
        var result = new BABYLON.Vector3();
        BABYLON.Vector3.UnprojectFloatsToRef(x, y, 0, viewport.width, viewport.height, BABYLON.Matrix.Identity(), scene.getViewMatrix(), scene.getProjectionMatrix(), result);
        return result;
    }

    function testApplesCollisionAround(x, y) {
        if (!testApplesCollision(x, y)) {
            if (!testApplesCollision(x, y - currentGameplay.ribbonThickness)) {
                return testApplesCollision(x, y + currentGameplay.ribbonThickness);
            }
            else {
                return true;
            }
        }
        else {
            return true;
        }
    }

    function testApplesCollisionBetween(previousPointer, currentPointer, distance) {
        var threshold = 0.005;

        if (!testApplesCollisionAround(currentPointer.x, currentPointer.y) && distance > threshold) {
            var step = 1 / (distance / threshold);
            for (var amount = step; amount < 1; amount += step) {
                var intermediatePointer = BABYLON.Vector2.Lerp(previousPointer, currentPointer, amount);
                if (testApplesCollisionAround(intermediatePointer.x, intermediatePointer.y)) {
                    return;
                }
            }
        }
    }

    function testApplesCollision(pointerX, pointerY) {
        var pickResult = scene.pick(pointerX, pointerY, function (mesh) {
            for (var i = 0; i < applesCollection.length; i++) {
                if (applesCollection[i].id === mesh.id) {
                    return true;
                }
            }
            return false;
        });

        if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.isVisible) {
            var evt = {};
            evt.additionalData = pickResult.pickedMesh;
            collisionHandler(evt);
            return true;
        }
        return false;
    }

    scene = createScene();

    // run the render loop
    engine.runRenderLoop(function () {
        scene.render();
    });

    // the canvas/window resize event handler
    window.addEventListener('resize', function () {
        engine.resize();
    });
});

document.addEventListener("DOMContentLoaded", function () {
    var logoImage = document.getElementById("logo");
    logoImage.onload = function () {
        logoImage.className = "logoReady";
    };
    logoImage.src = "images/LogoApplesCrusher300transparent.png";
});

