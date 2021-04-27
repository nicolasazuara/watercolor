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
    -   Mobile devices aren't an option:
        p5.js camera implementation is buggy and not mirrored by default (front-facing camera);
        ml5.js is too CPU intensive, draining too much power;
    -   A background color is required for color blending;
    -   Canvas resizing is too much of a hassle    
*/

let drawFrameRate = 30,                                 // Shared frame rate between video and canvas (user-defined)
    brushRadius = 50,                                   // Radius of the brush used for painting (user-defined)
    bgColor = 'linen',                                  // Color for the canvas (user-defined)
    colors = [                                          // Color palette (user-defined)
        'brown',
        'crimson',
        'tomato',
        'darkgoldenrod',
        'yellow',
        'olivedrab',
        'darkgreen',
        'deepskyblue',
        'navy',
        'violet',
    ],
    tracking = {                                        // Body parts to be tracked on video (user-defined)
        leftWrist: true,
        rightWrist: true,
        leftAnkle: true,
        rightAngle: true,
    },
    video,                                              // Video container
    poseNet,                                            // Machine learning model that allows for Real-time Human Pose Estimation
    poses = [],                                         // Array of poses detected from poseNet
    brushColor,                                         // Color of the brush used for painting
    picker,                                             // Color picker indicator
    buttonDownload,                                     // Download canvas button
    buttonClean,                                        // Clean canvas button
    spacing = window.innerWidth / (colors.length),      // Separation between colors in palette
    counter = 0,
    lastMouse = {                                       // Save last mouse location inside canvas if pressed
        x: 0,
        y: 0,
    };

// Class for paint brush (a single layer)
class brush {
    
    constructor(v) {
        this.vertices = v;                      // Array of vertices for the brush shape
        this.newVertices = [];                  // Array of vertices for the paint shape
        this.color = color(brushColor);         // Color for the paint
        this.color.setAlpha(2);                 // Opacity of 2/255 for the paint shape
    }
    
    // This method simulates the paint expansion
    deform() {
        // Placeholders for new vertices
        let x = 0,
            y = 0;
        
        // For each vertex of the brush, generate new vertices for the paint based on the vertex siblings, using brush radius as distortion
        for(let i = 0; i < this.vertices.length - 1; i++) {
            x = (this.vertices[i][0] + this.vertices[i + 1][0]) / 2 + random(-brushRadius, brushRadius);
            y = (this.vertices[i][1] + this.vertices[i + 1][1]) / 2 + random(-brushRadius, brushRadius);
            this.newVertices.push([x, y]);
        }
        
        // Generate another vertex for the paint based on the average of the first and last vertex,  using brush radius as distortion
        x = (this.vertices[0][0] + this.vertices[this.vertices.length - 1][0]) / 2 + random(-brushRadius, brushRadius);
        y = (this.vertices[0][1] + this.vertices[this.vertices.length - 1][1]) / 2 + random(-brushRadius, brushRadius);
        this.newVertices.push([x, y]);
        
        // Add each vertex of the paint to the brush vertices 
        for(let i = 0; i < this.newVertices.length; i++) {
            this.vertices.splice(1, 0, this.newVertices[i]);
        }
        
        // Clean the paint vertices
        this.newVertices = [];
    }
    
    // This method displays the paint, drawing a shape using the brush vertices and filling it with the brush color
    display() {        
        noStroke();
        fill(this.color);
        beginShape();
        for(let i = 0; i < this.vertices.length; i++) {
            vertex(this.vertices[i][0], this.vertices[i][1]);
        }
        endShape(CLOSE);
    }
}

// Class for brush strokes (generate layers or brushes)
class strokes {
    
    constructor(brushObject) {
        this.total = random(10, 30);    // Total of paint layers
        this.layers = [];               // Array of paint layers
        
        // For the total of the paint layers, generate a new brush stroke and store it in the paint layers
        for(let i = 0; i < this.total; i++) {
            let vertices = [];
            for(let j = 0; j < brushObject.vertices.length; j++) {
                vertices.push(brushObject.vertices[j]);
            }
            this.layers.push(new brush(vertices));
        }
    }
    
    // This method simulates the paint expansion as a whole
    deform() {
        for(let i = 0; i < this.total; i++) {
            this.layers[i].deform();
        }
    }
    
    // This method displays the paint layers as a whole
    display() {
        for(let i = 0; i < this.total; i++) {
            this.layers[i].display();
        }
    }
}

// Canvas setup (p5.js specific)
function setup() {
    
    // The paint canvas with a size equals to the viewport
    canvas = createCanvas(window.innerWidth - 50, window.innerHeight - 50);
    
    // Adjust draw frame rate
    frameRate(drawFrameRate);
    
    // Video height adjusted to viewport width, minus buttons video frame rate limited to draw frame rate and no audio
    let constraints = {
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
    video = createCapture(constraints);
    video.size(width, AUTO);
    
    // Generate the color palette at the bottom of the page
    for(let i = 0; i < colors.length; i++) {
        let colorPick = createDiv('&nbsp;');
        colorPick.size(spacing, 50);
        colorPick.style('background-color', colors[i]);
        colorPick.position(i * spacing, height);
    }
    
    // Generate the color picker indicator
    picker = createDiv('<span class="fa-stack fa-lg fa-fw"><i class="fas fa-circle fa-stack-2x"></i><i class="fas fa-arrow-down fa-stack-1x fa-inverse"></i></span>');
    picker.size(spacing);
    picker.style('text-align', 'center');
    
    // Generate the download canvas button
    buttonDownload = createButton('<i class="fas fa-download fa-lg fa-fw"></i>');
    buttonDownload.position(width, 0);
    buttonDownload.size(50);
    buttonDownload.style('text-align', 'center');
    buttonDownload.mousePressed(canvasDownload);
    
    // Generate the clean canvas button
    buttonClean = createButton('<i class="fas fa-broom fa-lg fa-fw"></i>');
    buttonClean.position(width, buttonDownload.size().height);
    buttonClean.size(50);
    buttonClean.style('text-align', 'center');
    buttonClean.mousePressed(canvasClean);

    // Create a new poseNet method, it will fire an event that fills the poses array everytime a new pose is detected
    poseNet = ml5.poseNet(video);
    poseNet.on('pose', function(results) {
        poses = results;
    });
    
    // Hide the video
    video.hide();
    
    // Start canvas original state
    canvasClean();
    
}

// Draw on canvas (p5.js specific)
function draw() {
    
    // If the camera detects one or morse poses
    if(poses.length > 0) {
        
        for(let i = 0; i < poses.length; i += 1) {
            
            // Select a random color
            counter++;
            if(counter > random(1, drawFrameRate)) {
                brushColor = random(colors);
                colorPicker(brushColor);
                counter = 1;
            }
            
            // Select the pose
            let pose = poses[i].pose,
                leftWrist = pose['leftWrist'],
                rightWrist = pose['rightWrist'],
                leftAnkle = pose['leftAnkle'],
                rightAnkle = pose['rightAnkle'];
            
            // If left wrist found and tracking is active
            if(tracking.leftWrist && leftWrist.confidence > 0.60) {
                
                // Start painting in left wrist position
                paint(leftWrist.x, leftWrist.y);
            }

            // If right wrist found and tracking is active
            if(tracking.rightWrist && rightWrist.confidence > 0.60) {

                // Start painting in right wrist position
                paint(rightWrist.x, rightWrist.y);
            }

            // If left ankle found and tracking is active
            if(tracking.leftAnkle && leftAnkle.confidence > 0.60) {
                
                // Start painting in left ankle position
                paint(leftAnkle.x, leftAnkle.y);
            }

            // If right ankle found and tracking is active
            if(tracking.rightAngle && rightAnkle.confidence > 0.60) {
                
                // Start painting in right ankle position
                paint(rightAnkle.x, rightAnkle.y);
            }
            
        }
        
    // Else
    } else {
        
        // Select the color from palette based on mouse position
        for(let i = 0; i < colors.length; i++) {
            if(mouseX > i * spacing && mouseX < (i * spacing) + spacing && mouseY > height && mouseY < window.innerHeight) {
                brushColor = colors[i];
                colorPicker(brushColor);
            }
        }
        
        // If the mouse position is saved
        if(lastMouse.x > 0 && lastMouse.y > 0) {

            // Start painting in saved mouse position
            paint(lastMouse.x, lastMouse.y);

            // Reset last mouse position
            lastMouse = {
                x: 0,
                y: 0,
            };
            
        }
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

// Set canvas original state
function canvasClean() {
    counter = 0;
    clear();
    brushColor = random(colors);
    background(bgColor);
    colorPicker(brushColor);
}

// Download canvas as image
function canvasDownload() {
    saveCanvas('watercolor-' + new Date().getTime(), 'jpg');
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
function paint(x, y) {
    let w = new strokes(new brush([ [x, y] ])),
        t = random(1, 5);
    for(let i = 0; i < 5; i++) {
        w.deform();
    }
    w.display();
}