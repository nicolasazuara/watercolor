/*
    MIT License

    Copyright (c) 2021 Nicolás Azuara Hernández (@nicolasazuara)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    
    -------------------------------------------------------------------------------
    
    Dependencies:
    -   p5.js (https://p5js.org/)
    -   ml5.js (https://ml5js.org/)
    -   fontawesome (https://fontawesome.com)
    
    Requirements:
    -   Webcam (optional)
    -   Microphone (optional)
    
    Notes:
    -   The canvas must be mirrored when using camera as input.
    -   A background color is required for color blending.
    -   Canvas resizing is too much of a hassle.
    -   Mobile cam implementation is buggy
*/

let drawFrameRate = 30,                                 // Shared frame rate between video and canvas
    brushRadius = 32,                                   // Radius of the brush used for painting
    colors = [                                          // Color palette, representing music notes
        '#ff0000',                                      // Red
        '#ff8000',                                      // Red + yellow
        '#ffff00',                                      // Yellow
        '#80ff00',                                      // Green + yellow
        '#00ff00',                                      // Green
        '#00ff80',                                      // Green + cyan
        '#00ffff',                                      // Cyan
        '#0080ff',                                      // Blue + cyan
        '#0000ff',                                      // Blue
        '#8000ff',                                      // Blue + magenta
        '#ff00ff',                                      // Magenta
        '#ff0080',                                      // Red + magenta
        '#ffffff',                                      // White
        '#000000',                                      // Black
    ],
    notes = [
        4,                                              // C
        5,                                              // C#
        6,                                              // D
        7,                                              // D#
        8,                                              // E
        9,                                              // F
        10,                                             // F#
        11,                                             // G
        0,                                              // G#
        1,                                              // A
        2,                                              // A#
        3,                                              // B
    ],
    tracking = false,                                   // Pose tracking status, disabled by default
    trackingBodyParts = {                               // Body parts to be tracked on video
        leftWrist: true,
        rightWrist: true,
        leftAnkle: true,
        rightAngle: true,
    },
    trackingConfidence = 0.6,                           // Minimum confidence on the tracked body parts
    listening = false,                                  // Sound notes detection status, disabled by default
    video,                                              // Video container
    audio,                                              // Audio context
    audioAnalyser,                                      // An audio node able to provide real-time frequency information
    poseNet,                                            // Machine learning model that allows for Real-time human pose detection
    poses = [],                                         // Array of poses detected from poseNet
    brushColor,                                         // Color of the brush used for painting
    picker,                                             // Color picker indicator
    buttonIncreaseBrushSize,                            // Increase brush size button
    buttonDecreaseBrushSize,                            // Decrease brush size button
    buttonTracking,                                     // Pose tracking button
    buttonListening,                                    // Sound notes detection button
    buttonDownload,                                     // Download canvas button
    buttonReset,                                        // Reset canvas button
    spacing = window.innerWidth / (colors.length),      // Separation between colors in palette
    lastMouse = {                                       // Save last mouse location inside canvas if pressed
        x: 0,
        y: 0,
    };

// Class for paint brush (a single layer)
class Brush {
    
    constructor(v) {
        this.vertices = v;                              // Array of vertices for the brush shape
        this.newVertices = [];                          // Array of vertices for the paint shape
        this.color = color(brushColor);                 // Color for the paint
        this.color.setAlpha(round(random(1, 2)));       // Opacity for the brush shape
    }
    
    // This method simulates the paint expansion
    deform() {
        
        // Placeholders for new vertices
        let x = 0,
            y = 0;
        
        // For each vertex of the brush, generate new vertices for the paint based on the vertex siblings, using brush radius as distortion
        for(let i = 0; i < this.vertices.length - 1; i++) {
            x = (this.vertices[i].x + this.vertices[i + 1].x) / 2 + random(-brushRadius, brushRadius);
            y = (this.vertices[i].y + this.vertices[i + 1].y) / 2 + random(-brushRadius, brushRadius);
            this.newVertices.push({
                x: x,
                y: y,
            });
        }
        
        // Generate another vertex for the paint based on the average of the first and last vertex,  using brush radius as distortion
        x = (this.vertices[0].x + this.vertices[this.vertices.length - 1].x) / 2 + random(-brushRadius, brushRadius);
        y = (this.vertices[0].y + this.vertices[this.vertices.length - 1].y) / 2 + random(-brushRadius, brushRadius);
        this.newVertices.push({
            x: x,
            y: y,
        });
        
        // Add each vertex of the paint to the brush vertices 
        for(let i = 0; i < this.newVertices.length; i++) {
            this.vertices.splice(1, 0, this.newVertices[i]);
        }
        
        // Reset the paint vertices
        this.newVertices = [];
    }
    
    // This method shows the paint, drawing a shape using the brush vertices and filling it with the brush color
    show() {        
        noStroke();
        fill(this.color);
        beginShape();
        for(let i = 0; i < this.vertices.length; i++) {
            vertex(this.vertices[i].x, this.vertices[i].y);
        }
        endShape(CLOSE);
    }
}

// Class for brush strokes (generate layers or brushes)
class Strokes {
    
    constructor(b) {
        this.total = random(8, 32);     // Total of paint layers
        this.layers = [];               // Array of paint layers
        
        // For the total of the paint layers, generate a new brush stroke and store it in the paint layers
        for(let i = 0; i < this.total; i++) {
            let vertices = [];
            for(let j = 0; j < b.vertices.length; j++) {
                vertices.push(b.vertices[j]);
            }
            this.layers.push(new Brush(vertices));
        }
    }
    
    // This method simulates the paint expansion as a whole
    deform() {
        for(let i = random(8); i > 0; i--) {
            for(let i = 0; i < this.total; i++) {
                this.layers[i].deform();
            }
        }
    }
    
    // This method shows the paint layers as a whole
    show() {
        for(let i = 0; i < this.total; i++) {
            this.layers[i].show();
        }
    }
}

// Canvas setup (p5.js specific)
function setup() {
    
    // The paint canvas with a size equals to the viewport
    canvas = createCanvas(window.innerWidth - 50, window.innerHeight - 50);
    
    // Adjust draw frame rate
    frameRate(drawFrameRate);
    
    // Generate the color palette at the bottom of the page
    for(let i = 0; i < colors.length; i++) {
        let colorPick = createDiv('&nbsp;');
        colorPick.size(spacing, 49);
        colorPick.style('background-color', colors[i]);
        colorPick.style('user-select', 'none');
        colorPick.position(i * spacing, height + 1);
    }
    
    // Generate the color picker indicator
    picker = createDiv();
    picker.size(spacing);
    picker.style('text-align', 'center');
    picker.style('user-select', 'none');
    changeBrushSize(0);
    
    // Generate the increase brush size button
    buttonIncreaseBrushSize = createButton('<span class="fa-stack"><i class="fas fa-paint-brush fa-stack-2x"></i><i class="fas fa-plus fa-stack-1x"></i></span>');
    buttonIncreaseBrushSize.position(width, 0);
    buttonIncreaseBrushSize.size(50);
    buttonIncreaseBrushSize.attribute('title', 'Increase brush size');
    buttonIncreaseBrushSize.mousePressed(increaseBrushSize);
    
    // Generate the decrease brush size button
    buttonDecreaseBrushSize = createButton('<span class="fa-stack"><i class="fas fa-paint-brush fa-stack-2x"></i><i class="fas fa-minus fa-stack-1x"></i></span>');
    buttonDecreaseBrushSize.position(width, 50);
    buttonDecreaseBrushSize.size(50);
    buttonDecreaseBrushSize.attribute('title', 'Decrease brush size');
    buttonDecreaseBrushSize.mousePressed(decreaseBrushSize);
    
    // Generate the pose tracking button
    buttonTracking = createButton('<i class="fas fa-video-slash fa-lg fa-fw"></i>');
    buttonTracking.position(width, 100);
    buttonTracking.size(50);
    buttonTracking.attribute('title', 'Enable pose tracking');
    buttonTracking.mousePressed(trackingToggle);
    
    // Generate the sound notes detection button
    buttonListening = createButton('<i class="fas fa-microphone-slash fa-lg fa-fw"></i>');
    buttonListening.position(width, 150);
    buttonListening.size(50);
    buttonListening.attribute('title', 'Enable sound notes detection');
    buttonListening.mousePressed(listeningToggle);
    
    // Generate the download canvas button
    buttonDownload = createButton('<i class="fas fa-download fa-lg fa-fw"></i>');
    buttonDownload.position(width, 200);
    buttonDownload.size(50);
    buttonDownload.attribute('title', 'Download canvas');
    buttonDownload.mousePressed(canvasDownload);
    
    // Generate the reset canvas button
    buttonReset = createButton('<i class="fas fa-recycle fa-lg fa-fw"></i>');
    buttonReset.position(width, 250);
    buttonReset.size(50);
    buttonReset.attribute('title', 'Reset canvas');
    buttonReset.mousePressed(canvasReset);
    
    // Start canvas original state
    canvasReset();
    
}

// Draw on canvas (p5.js specific)
function draw() {
    
    // If mouse over color palette
    if(mouseY >= height && mouseY <= window.innerHeight) {
        
        // Select the color from palette based on mouse position
        for(let i = 0; i < colors.length; i++) {
            if(mouseX > (i * spacing) && mouseX <= (i * spacing) + spacing) {
                brushColor = colors[i];
                colorPicker(brushColor);
                let clickEvent = document.createEvent('MouseEvents');
                clickEvent.initEvent('mouseup', true, true);
                document.querySelector('canvas').dispatchEvent(clickEvent);
                break;
            }
        }
        
    // If sound notes detection is active and the mouse isn't over color palette
    } else if(listening && mouseY < height) {
    
        // Detect audio frequency from signal using ACF2+
        let buffer = new Float32Array(2048);
        audioAnalyser.getFloatTimeDomainData(buffer);
        let frequency = acf2plus(buffer);

        // If an audio frequency exists
        if(frequency) {

            // Calculate sound note from audio frequency
            let note = (round(12 * (Math.log(frequency / 440) / Math.log(2))) + 69) % 12;

            // Use sound note to select color from palette
            brushColor = colors[ notes[ constrain(note, 0, notes.length) ] ];
            colorPicker(brushColor);

        }
    }
    
    // If pose tracking is active and human poses detected
    if(tracking && poses.length > 0) {
        
        // Mirror the canvas
        translate(width, 0);
        scale(-1, 1);
        
        // For each pose
        for(let i = 0; i < poses.length; i += 1) {
            
            // Select the pose
            let pose = poses[i].pose,
                leftWrist = pose['leftWrist'],
                rightWrist = pose['rightWrist'],
                leftAnkle = pose['leftAnkle'],
                rightAnkle = pose['rightAnkle'];
            
            // If left wrist found
            if(trackingBodyParts.leftWrist && leftWrist.confidence > trackingConfidence) {
                
                // Start painting in left wrist position
                paint(leftWrist);
            }

            // If right wrist found
            if(trackingBodyParts.rightWrist && rightWrist.confidence > trackingConfidence) {

                // Start painting in right wrist position
                paint(rightWrist);
            }

            // If left ankle found
            if(trackingBodyParts.leftAnkle && leftAnkle.confidence > trackingConfidence) {
                
                // Start painting in left ankle position
                paint(leftAnkle);
            }

            // If right ankle found
            if(trackingBodyParts.rightAngle && rightAnkle.confidence > trackingConfidence) {
                
                // Start painting in right ankle position
                paint(rightAnkle);
            }
            
        }
        
    // Else if the mouse position is saved
    } else if(lastMouse.x > 0 && lastMouse.y > 0) {

        // Start painting in saved mouse position
        paint(lastMouse);

        // Reset last mouse position
        lastMouse = {
            x: 0,
            y: 0,
        };

    }
}

// Mouse clicked event handler (p5.js specific)
function mouseClicked() {
    
    // Save mouse position
    saveMouse();
}

// Mouse dragged event handler (p5.js specific)
function mouseDragged() {
    
    // Save mouse position
    if(mouseIsPressed) saveMouse();
    
}

// Increase brush radio
function increaseBrushSize() {
    changeBrushSize(1);
}

// Decrease brush radio
function decreaseBrushSize() {
    changeBrushSize(-1);
}

// Increase/decrease brush radio
function changeBrushSize(i) {
    brushRadius = constrain((i * 8) + brushRadius, 8, 64);
    picker.html('<span class="fa-stack fa-lg fa-fw"><i class="fas fa-circle fa-stack-2x"></i><span class="fa-stack-1x fa-inverse">' + 2 * brushRadius + '</span></span>');
}

// Download canvas as image
function canvasDownload() {
    saveCanvas('watercolor-' + new Date().getTime(), 'jpg');
}

// Set canvas original state
function canvasReset() {
    clear();
    brushColor = random(colors);
    background('#ffffff');
    colorPicker(brushColor);
}


// Toggle pose tracking status
function trackingToggle() {
    
    // Enable the real-time human pose detection model for the first time
    if(! poseNet) {
        
        let mediaType = {
                video: {
                    mandatory: {
                        maxWidth: width,
                    },
                optional: [{
                    maxFrameRate: drawFrameRate,
                }],
                },
                audio: false,
            };
        video = createCapture(mediaType, function () {
            video.size(width, AUTO);
            poseNet = ml5.poseNet(video);
            poseNet.on('pose', function(r) {
                poses = r;
            });
            video.hide();
            trackingToggle();
        });
        
    }
    
    // Toggle status
    if(poseNet && tracking) {
        tracking = false;
        buttonTracking.html('<i class="fas fa-video-slash fa-lg fa-fw"></i>');
        buttonTracking.attribute('title', 'Enable pose tracking');
    } else if(poseNet) {
        tracking = true;
        buttonTracking.html('<i class="fas fa-video fa-lg fa-fw"></i>');
        buttonTracking.attribute('title', 'Disable pose tracking');
    }
}

// Toggle sound notes detection status
function listeningToggle() {
    
    // Enable the audio node for the first time
    if(! audioAnalyser) {
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia;
        navigator.getUserMedia(
            {
                audio: true,
            },
            function (stream) {
                audio = new AudioContext();
                audioMic = audio.createMediaStreamSource(stream);
                audioAnalyser = audio.createAnalyser();
                audioAnalyser.fftSize = 2048;
                audioMic.connect(audioAnalyser);
                listeningToggle();
            },
            function (error) {
                console.log(error);
            }
        );
    }

    // Toggle status
    if(audioAnalyser && listening) {
        listening = false;
        buttonListening.html('<i class="fas fa-microphone-slash fa-lg fa-fw"></i>');
        buttonListening.attribute('title', 'Enable sound notes detection');
    } else if(audioAnalyser) {
        listening = true;
        buttonListening.html('<i class="fas fa-microphone fa-lg fa-fw"></i>');
        buttonListening.attribute('title', 'Disable sound notes detection');
    }
    
}

// Set color picker position
function colorPicker(c) {
    picker.position(colors.indexOf(c) * spacing, height - picker.size().height / 2);
}

// Save mouse position inside canvas
function saveMouse() {
    if(mouseX <= width && mouseY <= height) {
        lastMouse = {
            x: mouseX,
            y: mouseY,
        };
    }
}

// Paint using brush and strokes classes, specifying a vertex
function paint(v) {
    let p = new Strokes(new Brush([v]));
    p.deform();
    p.show();
}

// ACF2+ signal frequency detection method
function acf2plus(buffer) {
    
    // Measure the signal
    let rms = 0;
    for(let i = 0; i < buffer.length; i++) {
        rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / buffer.length);
    
    // Stop. Signal too short
    if(rms < 0.01) return false;
    
    // Trimming the edges of the signal
    let r1 = 0,
        r1Found = false,
        r2 = buffer.length - 1,
        r2Found = false;
    for(let i = 0; i < buffer.length / 2; i++) {
        if(! r1Found && Math.abs(buffer[i]) < 0.2) {
            r1 = i;
            r1Found = true;
        }
        if(! r2Found && Math.abs(buffer[buffer.length - i]) < 0.2) {
            r2 = buffer.length - i;
            r2Found = true;
        }
        if(r1Found && r2Found) break;
    }
    buffer = buffer.slice(r1, r2);
    
    // Autocorrelation
    let c = new Array(buffer.length).fill(0);
    for(let i = 0; i < buffer.length; i++) {
        for(let j = 0; j < buffer.length - i; j++) {
            c[i] = c[i] + buffer[j] * buffer[j + i];
        }
    }
    
    // Find first dip and max peak
    let d = 0,
        maxVal = -1,
        maxPos = -1;
    while(c[d] > c[d + 1]) d++;
    for(let i = d; i < buffer.length; i++) {
        if(c[i] > maxVal) {
            maxVal = c[i];
            maxPos = i;
        }
    }
    
    // Interpolation
    let x1 = c[maxPos - 1],
        x2 = c[maxPos],
        x3 = c[maxPos + 1];
    let a = (x1 + x3 - 2 * x2) / 2,
        b = (x3 - x1) / 2;
    if(a) maxPos = maxPos - b / (2 * a);
    
    // Return signal frequency
    return round(audio.sampleRate / maxPos);
}