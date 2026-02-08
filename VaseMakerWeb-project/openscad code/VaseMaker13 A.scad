/*

NOTE: You need the file "BezierScad.scad" in the same folder as this file.
NOTE: You need to enable "function-literals" in Preferences...Features.
 *
 * Gary Muhonen  gary@dcity.org
 * version 2
 *   Added a full bezier curve capability to the overall vertical shape
        (instead of simple bezier curve). This
 *   Allows the waist and neck points to be moved vertically
        (instead of being fixed at 33 and 66 percent of the height).
 *   Added a shape fuction, so the starting shape could be any formula...
        like a cardiod (instead of just a circle)
 * version 3
 *   Added another twist function, which is controlled by a simple bezier curve)
 *   Added x and y offset capability so that the object can be moved around to
        adjust how the twisting is done.
 * version 4 -
 *    Added Rectangle and Butterfly
 * version 5
 *    Changed to a new Bezier shape function that allows for up to 8 control points.
 *    Changed the twist Bezier to use this same function, for up to 8 control points.
 *    Added a X offset Bezier curve (up to 8 control points).
 *    Added a Y offset Bezier curve (up to 8 control points).
 * version 6
 *    Added a parameter to each feature to easily turn the feature on or off.
 * version 7
 *    Added the Morph capability, to morph from one shape to another going vertically.
 * version 8
 *    Added a bezier curve to define the bottom and top shape DID NOT WORK out
 *    Went back to version 7 and jumped to version 9.
 * version 9
 *    Added the SuperFormula for more base and top shapes
 *         from:  https://en.wikipedia.org/wiki/SuperFormula
 * version 10
 *    Added the Customizer !!!  Major enhancement !!
 *    Added formula for Egg shape...  change the parameter E1a and E1b to change the shape. An Odd integer is best.
 * version 11
 *    Added the equation parameters to the Customizer
 * version 12
 *    Added Vertical Ripples and Vertical Smoothing
 *    Changed the name of Ruffles to Radial Ripples
 * version 13
 *    Added formulas for Diamond, Rose, Infinity, Superellipse
 *
 * Some code in this file was from:
 * Parametric Organic Vase
 * Designed by Jim DeVona, 2014 (http://www.thingiverse.com/thing:477840/#files)
 *
 * Creative Commons Attribution-ShareAlike 4.0 International License.
 * http://creativecommons.org/licenses/by-sa/4.0/
 */

/*
Notes:

Bezier Interpolation information
  https://web.archive.org/web/20131225210855/http://people.sc.fsu.edu/~jburkardt/html/bezier_interpolation.html
Module for Bezier curve:
  http://mathfaculty.fullerton.edu/mathews/n2003/BezierCurveMod.html

*/

// This is a great Bezier curve library
// use <../libraries/bezierSCAD/BezierScad.scad>;
// Put this file in the same folder as VaseMaker
use <BezierScad.scad>;




// *************************************************************************************************
// *************************************************************************************************
// START OF USER DEFINABLE PARAMETERS
// *************************************************************************************************
// *************************************************************************************************




// Put this marker in for spacing
/* [****************************************************************] */
dummyValue2 = true;


// *************************************************************************************************
// Resolution

/* [Resolution - Vertical and Radial] */

// PREVIEW MODE: Number of vertical layers 10-200
vertical_resolution_preview = 60; // [10:200]
// PREVIEW MODE: Number of facets in each vertical layer 10-360
radial_resolution_preview   = 120; // [10:360]

// RENDER MODE: Number of vertical layers 10-200
vertical_resolution_render = 120; // [10:200]
// RENDER MODE: Number of facets in each vertical layer 10-360
radial_resolution_render   = 180; // [10:360]







// *************************************************************************************************
// Vertical profile shape of the vase (bottom to top)
// *************************************************************************************************
// These parameters define the shape of the vase.
// The outer shape of the vase is defined by a Bezier curve. The Bezier curve
// requires 2 to 8 control points to define the curve.

// These two parameters are master parameters that change the overall size of
//    the vase (radius and height).
// You can use them to quickly resize the radius and the height of the vase.

/* [Radius and Height in mm] */

// Radius of the vase in mm
shapeDefaultRadius = 30;   // [10:100]
                                           // in mm, this is the default radius of the object,
                                           // but it is scaled by the shapePoints below.
// Height of the Vase in mm
shapeDefaultHeight = 100;   // [10:300]
                                            // in mm, this is the overall height of the object

// The shape of the object can be defined by up to 8 points (a radius and a height at each point)
// Change the numbers below to change the shape at each of these points.
// The bottom and top radius will be exact. The other radii are Bezier control points.
// You will need to adjust these control points to get the desired shape.
// The left hand number is the radius scaling factor control point (can be a negative number too).
// If you set this value to 2.0, it will define the radius at that height
//    to be 2.0 * shapeDefaultRadius.
// You may need to use negative values to swing the control point toward 0 quickly.
// The right hand number is the height factor (0-1).
// A value of .2 represents 20% of the overall height (shapeDefaultHeight).
// You can have 2-8 control points.
//     [radius control point(+/- scaling factor)  ,  at this height factor (0-1)]

/* [Radius Multiplier versus Height] */

// Enable Radius Multiplier
shapePointsOnFlag = true;

// Radius Multiplier for Top
shapePoint5 = 1; // [-5:.1:5]
// Radius Multiplier for Bottom + 80%
shapePoint4 = .6; // [-5:.1:5]
// Radius Multiplier for Bottom + 60%
shapePoint3 = 1; // [-5:.1:5]
// Radius Multiplier for Bottom + 40%
shapePoint2 = 1.8; // [-5:.1:5]
// Radius Multiplier for Bottom + 20%
shapePoint1 = 2.4; // [-5:.1:5]
// Radius Multiplier for Bottom
shapePoint0 = 1; // [-5:.1:5]

shapePoints = [
  [shapePoint0   ,   0 ],     // bottom radius and height control point (this height must be 0)
  [shapePoint1     ,  .2 ],
  [shapePoint2     ,  .4 ],
  [shapePoint3    ,  .6 ],
  [shapePoint4    ,  .8 ],
  [shapePoint5   ,   1 ]      // top radius and height control point (this height must be 1)
];











// *************************************************************************************************
// x,y Fixed Offset of the vase
// *************************************************************************************************
// To shift the object around the x-y plane, modify these parameters.
// Many shape functions are not centered around the origin, and their
// center can shift as they are scaled in size. Use these offset
// parameters to center an object about the origin.
// Sometimes the twist functions can cause rendering errors if
// an object is not placed around the origin correctly. You
// may have to try several positions to avoid rendering errors.
// Also, shifting an object around can give a different look
// to the twist features.
// Typically you will want the object to be centered near the origin, unless
// you want to twist the object arount the origin.
// Look at the bottom of the object and adjust these values to move the object
// until it is approximately centered, or where you want it.

/* [Offset X and Y of Bottom] */

// Shift the whole vase on x axis in mm [-100:100]
fixedOffsetX = 0;  //  [-100:100]
// Shift the whole vase on y axis in mm [-100:100]
fixedOffsetY = 0;  //  [-100:100]



// *************************************************************************************************
// x,y offset Bezier curve
// *************************************************************************************************
// A x,y offset value can be defined by a Bezier curve that changes the x and y offset
// based on the height of the object.
// This shifts the object along the x and y axes as the object climbs vertically.
// The points are evenly spaced vertically from 0 to the shapeDefaultHeight.
// The top and bottom points will be exact position, and the points in between are
// Bezier control points (so they won't make the exact offset but will influence
// the Bezier curve in the direction and value you choose).


/* [Offset X and Y versus Height] */

// Enable Bezier Offset X Y
bezierOffsetXYPointsOnFlag = false;  // [0:1]

// default x offset value for the bezier curve, in mm.
bezierOffsetX = 10;  // [1:50]
                          //      This is modified by the control points.
// default y offset value for the bezier curve, in mm.
bezierOffsetY = 10;  // [1:50]
                          //      This is modified by the control points.
// These are the x,y control points. You can have 2-8 control points
//    (which are spaced evenly vertically).
// [x offset control point  ,   y offset control point]

// X Offset Multiplier for TOP
bezierOffsetX5 = 0; // [-5:.1:5]
// Y Offset Multiplier TOP
bezierOffsetY5 = 0; // [-5:.1:5]
// X Offset Multiplier for BOTTOM + 80%
bezierOffsetX4 = 0; // [-5:.1:5]
// Y Offset Multiplier for BOTTOM + 80%
bezierOffsetY4 = 0; // [-5:.1:5]
// X Offset Multiplier for BOTTOM + 60%
bezierOffsetX3 = 0; // [-5:.1:5]
// Y Offset Multiplier BOTTOM + 60%
bezierOffsetY3 = 0; // [-5:.1:5]
// X Offset Multiplier for BOTTOM + 40%
bezierOffsetX2 = 0; // [-5:.1:5]
// Y Offset Multiplier BOTTOM + 40%
bezierOffsetY2 = 0; // [-5:.1:5]
// X Offset Multiplier for BOTTOM + 20%
bezierOffsetX1 = 0; // [-5:.1:5]
// Y Offset Multiplier BOTTOM + 20%
bezierOffsetY1 = 0; // [-5:.1:5]
// X Offset Multiplier for BOTTOM
bezierOffsetX0 = 0; // [-5:.1:5]
// Y Offset Multiplier BOTTOM
bezierOffsetY0 = 0; // [-5:.1:5]


bezierOffsetXYPoints = [
  [bezierOffsetX0    ,    bezierOffsetY0],          // x,y offset at the bottom
  [bezierOffsetX1    ,    bezierOffsetY1],
  [bezierOffsetX2    ,    bezierOffsetY2],
  [bezierOffsetX3    ,    bezierOffsetY3],
  [bezierOffsetX4    ,    bezierOffsetY4],
  [bezierOffsetX5    ,    bezierOffsetY5]           // x,y offset at the top
];













// *************************************************************************************************
// Radial Ripples
// *************************************************************************************************
// Radial Ripples added to the surface

/* [Radial Ripples] */
// Enabe Radial Ripples
radialRippleOn = false;
// Number of Radial Ripples on surface [1:60]
radialRippleCount = 6; // [1:60]
// Maximum inset/offset of each radialRipple. (mm), 0 = no radialRipple
// Radial Ripples Depth in mm [0:20]
radialRippleDepth = 4; // [0:.1:20]



// *************************************************************************************************
// Vertical Ripples
// *************************************************************************************************
// Vertical Ripples added to the surface

/* [Vertical Ripples] */
// Enable Vertical Ripples
verticalRippleOn = false;
// Number of Vertical Ripples on surface [1:60]
verticalRippleCount = 20; // [1:.2:60]
// Maximum inset/offset of each Vertical Ripple. (mm), 0 = no Vertical Ripplesv
// Vertical Ripple Depth in mm [0:20]
verticalRippleDepth = 1; // [0:.1:20]




// *************************************************************************************************
// Bezier Curve Twist from bottom to top
// *************************************************************************************************
// This twist is a "bezierTwist" which twists all of the features on the object, based on a
// bezier curve.
// This twist is applied after all of the other features are built (radialRipples, smoothing, and twist #2).
// You specify 2 to 8 twist control points which are space evenly vertically.
// The top and the bottom points will give you a precise amount of twist (say 0 or 90 degrees).
// The intermediate points are Bezier control points, and you will have to adjust these to get
// the shape you want.
// You can specify + or - values of twist (degrees).
// NOTE: THIS FEATURE TWISTS THE OBJECT AROUND THE Z-AXIS (X=0 AND Y=0),
//          NOT THE CENTER OF THE BASE OF THE OBJECT!
//          So, if you have offset the object away from the origin,
//          then it will make a twist around the z axis.


/* [Twist at Vertical Points] */
// Enable Bezier Twist Points
bezierTwistPointsOnFlag = false;




// Bezier Twist for TOP  [-180:180]
bezierTwist4= 0; // [-180:180]
// Bezier Twist for Bottom + 75%  [-180:180]
bezierTwist3 = 0; // [-180:180]
// Bezier Twist for Bottom + 50%  [-180:180]
bezierTwist2 = 0; // [-180:180]
// Bezier Twist for Bottom + 25%  [-180:180]
bezierTwist1 = 0; // [-180:180]
// Bezier Twist for Bottom  [-180:180]
bezierTwist0 = 0; // [-180:180]


// Bezier Twist Amount in Degrees starting at Bottom
bezierTwistPoints = [bezierTwist0,bezierTwist1,bezierTwist2,bezierTwist3,bezierTwist4];



// *************************************************************************************************
// Sine Wave Twisting of the radialRipples from bottom to top.
// *************************************************************************************************
// This twisting feature allows you to twist ONLY the radialRipples back and forth (sineTwistCycles).
// sineTwistCycles is the number of alternating twists applied to radialRipples,
// where the twisting alternates back and forth between +sineTwistMax and -sineTwistMax.
// sineTwistCycles = 0 is no twist. sineTwistCycles = 1 is a continous twist in 1 direction.

/* [Twist Cycles] */
// Enable Sine Wave Twists
sineTwistOn = false;
// Set Number of Sine Wave Twists [0:6]
sineTwistCycles = 2; // [0:6]
// Extent of each twist in each direction. (degrees)  - can be more than +- 90 if desired
// Set Twist Max Rotation in Degrees [-180:180]
sineTwistMax = 50; // [-180:180]








// *************************************************************************************************
// Vertical Smoothing of the Ripples from bottom to top
// *************************************************************************************************
// Vertical Smoothing Function, smoothes out the Ripples from bottom to top in a number of verticalSmoothingCycles.
// verticalSmoothingCycles is the number of transitions from Ripples to smooth (vertically).
// The Ripples are smoothed out vertically.

/* [Smooth Vertically] */
// Enable Vertical Smoothing Transitions
verticalSmoothingCyclesOn = false;

// verticalSmoothingCycles = 0 is no smoothing action.
// These are vertical cycles... where the radialRipples are smoothed (reduced) and then enhanced
//    this many times.
// Set Number of Vertical Smoothing Transitions [0:10]
verticalSmoothingCycles = 3; // [0:10]
// Adjust vertical position of smoothing transitions. (%)
// This setting is a little confusing...
// If you set it to 10, there will be radialRipples at 10% up the object, and then it
// transitions from there.
// If you set it to 50, there will be radialRipples at 50% and there will be
// transitions above and below that point, based on the verticalSmoothingCycles parameter.
// Set Vertical Smoothing Transition Height 0-100 %
verticalSmoothingStartHeightPercentage = 0; // [0:100]





// *************************************************************************************************
// Radial Smoothing of the Ripples going radially around vase
// *************************************************************************************************
// Radial Smoothing Function, smoothes out the Ripples going around radially in a number of radialSmoothingCycles.
// radialSmoothingCycles is the number of transitions from Ripples to smooth (radially).
// The Ripples are smoothed out radially.

/* [Smooth Radially] */
// Enable Vertical Smoothing Transitions
radialSmoothingCyclesOn = false;

// radialSmoothingCycles = 0 is no smoothing action.
// These are radial cycles... where the Ripples are smoothed (reduced) and then enhanced
//    this many times.
// Set Number of Radial Smoothing Transitions [0:10]
radialSmoothingCycles = 3; // [0:10]
// Set the Offset Angle [-180:180]
radialSmoothingOffsetAngle = 0; // [-180:180]



/* [Select Bottom and Top Shape Formulas] */



// Enable Morphing Bottom to Top (if Off, only Bottom is used) 
morphOnFlag = false;
// Select formula for shape at the bottom
bottomShapeSelector = "Circle1"; // [Butterfly1, Cardiod1, Cardiod2, Cardiod3, Circle1, Diamond1, Egg1, Egg2,  Ellipse1, Heart1, Infinity1, Misc1, Polygon1, Rectangle1, Rose1, Square1, SuperEllipse1, SuperFormula1]
// Select formula for shape at the top
topShapeSelector = "Circle1"; // [Butterfly1, Cardiod1, Cardiod2, Cardiod3, Circle1, Diamond1, Egg1, Egg2,  Ellipse1, Heart1, Infinity1, Misc1, Polygon1, Rectangle1, Rose1, Square1, SuperEllipse1, SuperFormula1]


// Put this marker in for spacing
/* [*****************************************************************] */
dummyValue = true;


// *************************************************************************************************
// Base Shape Function
// *************************************************************************************************
// This is the shape function that controls the base shape that is extruded upward.
// Included shapes are circle, cardiod1, cardiod2, ...
// The shapeScaleFactor term scales the size of the overall formula. Set shapeScaleFactor
//   such that the shape has an approximate radius of 1.
// The shapeOffsetX and shapeOffsetY terms are used to center the formula around the origin
//   in the x-y plane. Note: Be sure fixedOffsetX and fixedOffsetY (near top of this file)
//   are set to 0, when you are adjusting these values.
//   Note:  these 2 values do not change the origin of the shape function (so you can still
//          have problems if the origin is right on the curve and all pie slices will
//          be on the edge of the curve and not inside the curve !!!!)
//          I have this problem with the current egg curve.
// Un-comment the 1 line of code for the shape you want to use (keep the rest commented).
// Alphabetical Order:






/* [Bottom Butterfly1 Formula Parameters] */
// Butterfly1
//  (http://hubpages.com/education/Butterfly-Curves-in-Polar-Coordinates-on-a-Graphing-Calculator)
// Butterfly1 Size [.1:.1:3]
Butterfly1ScaleFactor = .2; // [.1:.1:3]
// Butterfly1 Offset X in mm [-50:50]
Butterfly1OffsetX = 0; // [-50:50]
// Butterfly1 Offset Y in mm [-50:50]
Butterfly1OffsetY = 0; // [-50:50]

/* [Bottom Cardiod1 Formula Parameters] */
// Cardiod1 - This is a simple pure cardiod formula. It has a sharp indention.
// Cardiod1 Size [.1:.1:3]
Cardiod1ScaleFactor = .7; // [.1:.1:3]
// Cardiod1 Offset X in mm [-50:50]
Cardiod1OffsetX = 0; // [-50:50]
// Cardiod1 Offset Y in mm [-50:50]
Cardiod1OffsetY = 17; // [-50:50]

/* [Bottom Cardiod2 Formula Parameters] */
// Cardiod2 - Another cardiod with a smoother indention (I LIKE THIS CARDIOD THE BEST !!!!!)
// Cardiod2 Size [.1:.1:3]
Cardiod2ScaleFactor = .3; // [.1:.1:3]
// Cardiod1 Offset X in mm [-50:50]
Cardiod2OffsetX = 12; // [-50:50]
// Cardiod1 Offset Y in mm [-50:50]
Cardiod2OffsetY = 0; // [-50:50]

/* [Bottom Cardiod3 Formula Parameters] */
// Cardiod3 - Another cardiod with smooth indention (The +3 term moves the cardiod away from the origin).
// Cardiod3 Size [.1:.1:3]
Cardiod3ScaleFactor = .3; // [.1:.1:3]
// Cardiod3 Offset X in mm [-50:50]
Cardiod3OffsetX = 0; // [-50:50]
// Cardiod3 Offset Y in mm [-50:50]
Cardiod3OffsetY = -6; // [-50:50]

/* [Bottom Circle1 Formula Parameters] */
// Circle1 - simple circle shape
// Circle1 Size [.1:.1:3]
Circle1ScaleFactor = 1; // [.1:.1:3]
// Circle1 Offset X in mm [-50:50]
Circle1OffsetX = 0; // [-50:50]
// Circle1 Offset Y in mm [-50:50]
Circle1OffsetY = 0; // [-50:50]

/* [Bottom Diamond Formula Parameters] */
// Diamond
//  
// Diamond Size [.1:.1:3]
Diamond1ScaleFactor = 1; // [.1:.1:3]
// Diamond Scale X Direction [.1:.1:3]
Diamond1ScaleX = 1; // [.1:.1:3]
// Diamond Scale Y Direction [.1:.1:3]
Diamond1ScaleY = 1; // [.1:.1:3]
// Diamond1 Offset X in mm [-50:50]
Diamond1OffsetX = 0; // [-50:50]
// Diamond1 Offset Y in mm [-50:50]
Diamond1OffsetY = 0; // [-50:50]

/* [Bottom Egg1 Formula Parameters] */
// Egg1 - Egg shape. Change Egg1Width to change the shape some. Usually an odd integer is best. Larger numbers make the egg narrower.
// http://www.mathematische-basteleien.de/eggcurves.htm
// Egg1 Size [.1:.1:3]
Egg1ScaleFactor = 1; // [.1:.1:3]
// Egg1 Width (smaller is bigger) [1:.1:5]
Egg1Width = 2.5; // [1:.1:5]
// Egg1 Offset X in mm [-50:50]
Egg1OffsetX = 0; // [-50:50]
// Egg1 Offset Y in mm [-50:50]
Egg1OffsetY = -30; // [-50:50]


/* [Bottom Egg2 Formula Parameters] */
// Egg2 - Egg shape. Change Egg2a and Egg2b to change the shape some.
//  https://www.geogebra.org/m/J96JSbXz
//  See the 2nd response at the following link
//       https://math.stackexchange.com/questions/1617961/polar-coordinates-of-an-egg-shaped-curve
// Egg2 Size [.1:.1:3]
Egg2ScaleFactor = .3; // [.1:.1:3]
// Egg2a Parameter [0:.1:2]
Egg2a = .9; // [0:.1:2]
// Egg2b Parameter [.7:.1:4]
Egg2b = 2.4; // [.7:.1:4]
// Egg2 Offset X in mm [-50:50]
Egg2OffsetX = 0; // [-50:50]
// Egg2 Offset Y in mm [-50:50]
Egg2OffsetY = 0; // [-50:50]


/* [Bottom Ellipse1 Formula Parameters] */
// Ellipse1 (change EllipseX and EllipseY as needed)
// http://math.stackexchange.com/questions/315386/ellipse-in-polar-coordinates
// Ellipse1 Size [.1:.1:3]
Ellipse1ScaleFactor = 1; // [.1:.1:3]
// Ellipse1 Scale X Direction [.1:.1:3]
Ellipse1ScaleX = .6; // [.1:.1:3]
// Ellipse1 Scale Y Direction [.1:.1:3]
Ellipse1ScaleY = 1.2; // [.1:.1:3]
// Ellipse1 Offset X in mm [-50:50]
Ellipse1OffsetX = 0; // [-50:50]
// Ellipse1 Offset Y in mm [-50:50]
Ellipse1OffsetY = 0; // [-50:50]

/* [Bottom Heart1 Formula Parameters] */
// Heart1 shape
// (http://www.mathematische-basteleien.de/heart.htm)
// Heart1 Size [.1:.1:3]
Heart1ScaleFactor = 1.7; // [.1:.1:3]
// Heart1 Offset X in mm [-50:50]
Heart1OffsetX = -12; // [-50:50]
// Heart1 Offset Y in mm [-50:50]
Heart1OffsetY = 0; // [-50:50]


/* [Bottom Infinity Formula Parameters] */
// Infinity - or Hippopede
//  (http://mathworld.wolfram.com/Hippopede.html)
// Infinity Size [.1:.1:3]
Infinity1ScaleFactor = 1; // [.1:.1:3]
// Infinity Shape [1.02:.01:2]
Infinity1Parameter1 = 1.02; // [1.02:.01:2]
// Infinity1 Offset X in mm [-50:50]
Infinity1OffsetX = 0; // [-50:50]
// Infinity1 Offset Y in mm [-50:50]
Infinity1OffsetY = 0; // [-50:50]

/* [Bottom Misc1 Formula Parameters] */
// Misc1 - Interesting shape. Change Misc1a and Misc1b to change the shape some.
// Try values of 3 and 1 for starters
// Misc1 Size [.1:.1:3]
Misc1ScaleFactor = 1; // [.1:.1:3]
// Misc1a Parameter [0:.1:5]  Try 3
Misc1a = 3; // [0:.1:5]
// Misc1b Parameter [0:.1:5]  Try 1
Misc1b = 1; // [0:.1:5]
// Misc1 Offset X in mm [-50:50]
Misc1OffsetX = 0; // [-50:50]
// Misc1 Offset Y in mm [-50:50]
Misc1OffsetY = 0; // [-50:50]

/* [Bottom Polygon1 Formula Parameters] */
// Polygon1 with n sides (change sides as needed) (http://math.stackexchange.com/questions/777739/equation-of-a-regular-polygon-in-polar-coordinates)
// Polygon1 Size [.1:.1:3]
Polygon1ScaleFactor = 1; // [.1:.1:3]
// Polygon1 Number of Sides [3:30]
Polygon1SidesNumber = 5; // [3:30]
// Polygon1 Offset X in mm [-50:50]
Polygon1OffsetX = 0; // [-50:50]
// Polygon1 Offset Y in mm [-50:50]
Polygon1OffsetY = 0; // [-50:50]

/* [Bottom Rectangle1 Formula Parameters] */
// Rectangle1 - simple rectangle (change xSide and ySide as needed)
// http://stackoverflow.com/questions/4788892/draw-square-with-polar-coordinates
// Rectangle1 Size [.1:.1:3]
Rectangle1ScaleFactor = 1; // [.1:.1:3]
// Rectangle1 Scale X Direction [.1:.1:3]
Rectangle1ScaleX = 1; // [.1:.1:3]
// Rectangle1 Scale Y Direction [.1:.1:3]
Rectangle1ScaleY = 1.5; // [.1:.1:3]
// Rectangle1 Offset X in mm [-50:50]
Rectangle1OffsetX = 0; // [-50:50]
// Rectangle1 Offset Y in mm [-50:50]
Rectangle1OffsetY = 0; // [-50:50]

/* [Bottom Rose1 Formula Parameters] */
// http://mathworld.wolfram.com/Rose.html
// Rose1 Size [.1:.1:3]
Rose1ScaleFactor = 1; // [.1:.1:3]
// Rose1 Center Size [1.1:.1:8]
Rose1CenterSize = 1.5; // [1.2:.1:8]
// Rose1 Pedal Number [2:8]
Rose1PedalNumber = 4; // [2:8]
// Rose1 Offset X in mm [-50:50]
Rose1OffsetX = 0; // [-50:50]
// Rose1 Offset Y in mm [-50:50]
Rose1OffsetY = 0; // [-50:50]



/* [Bottom Square1 Formula Parameters] */
// Square1 - simple square
// http://stackoverflow.com/questions/4788892/draw-square-with-polar-coordinates
// Square1 Size [.1:.1:3]
Square1ScaleFactor = 1; // [.1:.1:3]
// Square1 Offset X in mm [-50:50]
Square1OffsetX = 0; // [-50:50]
// Square1 Offset Y in mm [-50:50]
Square1OffsetY = 0; // [-50:50]

/* [Bottom SuperEllipse1 Formula Parameters] */
// SuperEllipse1 - many shapes possible with this one... see:
//    https://en.wikipedia.org/wiki/Superellipse
//    http://frink.machighway.com/~dynamicm/super-ellipse.html
// SuperEllipse1 Size [.1:.1:3]
SuperEllipse1ScaleFactor = 1; // [.1:.1:3]
// SuperEllipse1 Shape Parameter [.1:.1:7]
SuperEllipse1n = 2.8; // [.1:.1:7]
// SuperEllipse1 Size X [.1:.1:7]
SuperEllipse1ScaleX = .6; // [.1:.1:7]
// SuperEllipse1 Size Y [.1:.1:7]
SuperEllipse1ScaleY = 1; // [.1:.1:7]
// SuperEllipse1 Offset X in mm [-50:50]
SuperEllipse1OffsetX = 0; // [-50:50]
// SuperEllipse1 Offset Y in mm [-50:50]
SuperEllipse1OffsetY = 0; // [-50:50]



/* [SuperFormula1 Formula Parameters] */
// SuperFormula1 - many shapes possible with this one... see:  https://en.wikipedia.org/wiki/Superformula
// SuperFormula1 Size [.1:.1:3]
SuperFormula1ScaleFactor = 1; // [.1:.1:3]
// SuperFormula1 Parameter a [.1:.1:7]
SuperFormula1a = 1; // [.1:.1:7]
// SuperFormula1 Parameter b [.1:.1:7]
SuperFormula1b = 1; // [.1:.1:7]
// SuperFormula1 Parameter m [.1:.1:7]
SuperFormula1m = 2; // [.1:.1:7]
// SuperFormula1 Parameter n1 [.1:.1:7]
SuperFormula1n1 = .4; // [.1:.1:7]
// SuperFormula1 Parameter n2 [.1:.1:7]
SuperFormula1n2 = 1; // [.1:.1:7]
// SuperFormula1 Parameter n3 [.1:.1:7]
SuperFormula1n3 = 2; // [.1:.1:7]
// SuperFormula1 Offset X in mm [-50:50]
SuperFormula1OffsetX = 0; // [-50:50]
// SuperFormula1 Offset Y in mm [-50:50]
SuperFormula1OffsetY = 0; // [-50:50]




// Other equations that were not too useful
      // (http://mathworld.wolfram.com/HeartCurve.html)  This heart was to pointy
      // function bottomShapeFunction(t) =    shapeScaleFactor * ( 2 - 2 * sin(t) + sin( t ) * ( sqrt( abs( cos(t)))) / (sin(t) + 1.4 ) );

// Put this marker in for spacing
/* [*************************************************************] */
dummyValue1 = true;


// *************************************************************************************************
// Top Shape Function (we morph from the bottom shape to the top shape IF morphOn is set to 1 below)
// *************************************************************************************************
// This is the shape function that controls the top shape that is extruded upward.
// Included shapes are circle, cardiod1, cardiod2, ...
// The shapeScaleFactor term scales the size of the overall formula. Set shapeScaleFactor
//   such that the shape has an approximate radius of 1.
// The shapeOffsetX and shapeOffsetY terms are used to center the formula around the origin
//   in the x-y plane. Note: Be sure fixedOffsetX and fixedOffsetY (near top of this file)
//   are set to 0, when you are adjusting these values.
// Un-comment the 1 line of code for the shape you want to use (keep the rest commented).
// Alphabetical Order:






/* [Top Butterfly1 Formula Parameters] */
// Butterfly1 (http://hubpages.com/education/Butterfly-Curves-in-Polar-Coordinates-on-a-Graphing-Calculator)
// Butterfly1 Size [.1:.1:3]
TopButterfly1ScaleFactor = .2; // [.1:.1:3]


/* [Top Cardiod1 Formula Parameters] */
// Cardiod1 - This is a simple pure cardiod formula. It has a sharp indention.
// Cardiod1 Size [.1:.1:3]
TopCardiod1ScaleFactor = .7; // [.1:.1:3]


/* [Top Cardiod2 Formula Parameters] */
// Cardiod2 - Another cardiod with a smoother indention (I LIKE THIS CARDIOD THE BEST !!!!!)
// Cardiod2 Size [.1:.1:3]
TopCardiod2ScaleFactor = .3; // [.1:.1:3]


/* [Top Cardiod3 Formula Parameters] */
// Cardiod3 - Another cardiod with smooth indention (The +3 term moves the cardiod away from the origin).
// Cardiod3 Size [.1:.1:3]
TopCardiod3ScaleFactor = .3; // [.1:.1:3]


/* [Top Circle1 Formula Parameters] */
// Circle1 - simple circle shape
// Circle1 Size [.1:.1:3]
TopCircle1ScaleFactor = 1; // [.1:.1:3]


/* [Top Diamond Formula Parameters] */
// Diamond
//  
// Diamond Size [.1:.1:3]
TopDiamond1ScaleFactor = 1; // [.1:.1:3]
// Diamond Scale X Direction [.1:.1:3]
TopDiamond1ScaleX = 1; // [.1:.1:3]
// Diamond Scale Y Direction [.1:.1:3]
TopDiamond1ScaleY = 1; // [.1:.1:3]

/* [Top Egg1 Formula Parameters (maybe buggy ??)] */
// Egg1 - Egg shape. Change E1a to change the shape some. Usually an odd integer is best. Larger numbers make the egg narrower.
// Egg1 Size [.1:.1:3]
TopEgg1ScaleFactor = 1; // [.1:.1:3]
// Egg1 Width (smaller is bigger) [1:.1:5]
TopEgg1Width = 2.5; // [1:.1:5]


/* [Top Egg2 Formula Parameters] */
// Egg2 - Egg shape. Change Egg2a and Egg2b to change the shape some.
// Egg2 Size [.1:.1:3]
TopEgg2ScaleFactor = .3; // [.1:.1:3]
// Egg2a Parameter [0:.1:2]
TopEgg2a = .9; // [0:.1:2]
// Egg2b Parameter [.7:.1:4]
TopEgg2b = 2.4; // [.7:.1:4]



/* [Top Ellipse1 Formula Parameters] */
// Ellipse1 (change EllipseX and EllipseY as needed)
// Ellipse1 Size [.1:.1:3]
TopEllipse1ScaleFactor = 1; // [.1:.1:3]
// Ellipse1 Scale X Direction [.1:.1:3]
TopEllipse1ScaleX = .6; // [.1:.1:3]
// Ellipse1 Scale Y Direction [.1:.1:3]
TopEllipse1ScaleY = 1.2; // [.1:.1:3]


/* [Top Heart1 Formula Parameters] */
// Heart1 shape (http://www.mathematische-basteleien.de/heart.htm)
// Heart1 Size [.1:.1:3]
TopHeart1ScaleFactor = 1.7; // [.1:.1:3]

/* [Top Infinity Formula Parameters] */
// Infinity - or Hippopede
//  (http://mathworld.wolfram.com/Hippopede.html)
// Infinity Size [.1:.1:3]
TopInfinity1ScaleFactor = 1; // [.1:.1:3]
// Infinity Shape [1.02:.01:2]
TopInfinity1Parameter1 = 1.02; // [1.02:.01:2]

/* [Top Misc1 Formula Parameters] */
// Misc1 - Interesting shape. Change Misc1a and Misc1b to change the shape some.
// Try values of 3 and 1 for starters
// Misc1 Size [.1:.1:3]
TopMisc1ScaleFactor = 1; // [.1:.1:3]
// Misc1a Parameter [0:.1:5] Try 3
TopMisc1a = 3; // [0:.1:5]
// Misc1b Parameter [0:.1:5] Try 1
TopMisc1b = 1; // [0:.1:5]

/* [Top Polygon1 Formula Parameters] */
// Polygon1 with n sides (change sides as needed) (http://math.stackexchange.com/questions/777739/equation-of-a-regular-polygon-in-polar-coordinates)
// Polygon1 Size [.1:.1:3]
TopPolygon1ScaleFactor = 1; // [.1:.1:3]
// Polygon1 Number of Sides [3:30]
TopPolygon1SidesNumber = 5; // [3:30]


/* [Top Rectangle1 Formula Parameters] */
// Rectangle1 - simple rectangle (change xSide and ySide as needed)
// Rectangle1 Size [.1:.1:3]
TopRectangle1ScaleFactor = 1; // [.1:.1:3]
// Rectangle1 Scale X Direction [.1:.1:3]
TopRectangle1ScaleX = 1; // [.1:.1:3]
// Rectangle1 Scale Y Direction [.1:.1:3]
TopRectangle1ScaleY = 1.5; // [.1:.1:3]

/* [Top Rose1 Formula Parameters] */
// http://mathworld.wolfram.com/Rose.html
// Rose1 Size [.1:.1:3]
TopRose1ScaleFactor = 1; // [.1:.1:3]
// Rose1 Center Size [1.1:.1:8]
TopRose1CenterSize = 1.5; // [1.2:.1:8]
// Rose1 Pedal Number [2:8]
TopRose1PedalNumber = 4; // [2:8]

/* [Top Square1 Formula Parameters] */
// Square1 - simple square
// Square1 Size [.1:.1:3]
TopSquare1ScaleFactor = 1; // [.1:.1:3]

/* [Top SuperEllipse1 Formula Parameters] */
// SuperEllipse1 - many shapes possible with this one... see:
//    https://en.wikipedia.org/wiki/Superellipse
//    http://frink.machighway.com/~dynamicm/super-ellipse.html
// SuperEllipse1 Size [.1:.1:3]
TopSuperEllipse1ScaleFactor = 1; // [.1:.1:3]
// SuperEllipse1 Parameter n [.1:.1:7]
TopSuperEllipse1n = 2.8; // [.1:.1:7]
// SuperEllipse1 Size X [.1:.1:7]
TopSuperEllipse1ScaleX = .6; // [.1:.1:7]
// SuperEllipse1 Size Y [.1:.1:7]
TopSuperEllipse1ScaleY = 1; // [.1:.1:7]



/* [Top SuperFormula1 Formula Parameters] */
// SuperFormula1 - many shapes possible with this one... see:  https://en.wikipedia.org/wiki/Superformula
// SuperFormula1 Size [.1:.1:3]
TopSuperFormula1ScaleFactor = 1; // [.1:.1:3]
// SuperFormula1 Parameter a [.1:.1:7]
TopSuperFormula1a = 1; // [.1:.1:7]
// SuperFormula1 Parameter b [.1:.1:7]
TopSuperFormula1b = 1; // [.1:.1:7]
// SuperFormula1 Parameter m [.1:.1:7]
TopSuperFormula1m = 2; // [.1:.1:7]
// SuperFormula1 Parameter n1 [.1:.1:7]
TopSuperFormula1n1 = .4; // [.1:.1:7]
// SuperFormula1 Parameter n2 [.1:.1:7]
TopSuperFormula1n2 = 1; // [.1:.1:7]
// SuperFormula1 Parameter n3 [.1:.1:7]
TopSuperFormula1n3 = 2; // [.1:.1:7]






// Other equations that were not too useful
      // (http://mathworld.wolfram.com/HeartCurve.html)  This heart was to pointy
      // function bottomShapeFunction(t) =    shapeScaleFactor * ( 2 - 2 * sin(t) + sin( t ) * ( sqrt( abs( cos(t)))) / (sin(t) + 1.4 ) );








// *************************************************************************************************
// *************************************************************************************************
// END OF USER DEFINABLE PARAMETERS
// *************************************************************************************************
// *************************************************************************************************


// given the text string of the shape (e.g. Circle)
// the function returns a function literal e.g.   function (t) t*t*2
bottomShapeFunctionLiteral = function(which)


  
  which == "Butterfly1"
  ? function (t) .1 * Butterfly1ScaleFactor*(8-sin(t)+2*sin(3*t)+2*sin(5*t)-sin(7*t)+3*cos(2*t)-2*cos(4*t))

  : which == "Cardiod1"
  ? function (t) Cardiod1ScaleFactor*(1-sin(t))

  : which == "Cardiod2"
  ? function (t) Cardiod2ScaleFactor*(.5*(5-4*cos(t)))

  : which == "Cardiod3"
  ? function (t) Cardiod3ScaleFactor*sqrt(pow(((1-sin(t))*cos(t)),2)+pow(((1-sin(t))*sin(t)+3),2))

  : which == "Circle1"
  ? function (t) Circle1ScaleFactor
  
  :which == "Diamond1"
  ? function (t) Diamond1ScaleFactor*(1/(abs((1/Diamond1ScaleX)*cos(t))+abs((1/Diamond1ScaleY)*sin(t))))  

  : which == "Egg1"
  ? function (t) 2*Egg1ScaleFactor*pow(sin(t),Egg1Width)

  : which == "Egg2"
  ? function (t) Egg2ScaleFactor*(   cos(t)*cos(t) + Egg2a * cos(t) + Egg2b )

  : which == "Ellipse1"
  ? function (t) Ellipse1ScaleFactor*Ellipse1ScaleX*Ellipse1ScaleY/sqrt(pow(Ellipse1ScaleY*cos(t),2)+pow(Ellipse1ScaleX*sin(t),2))

  : which == "Heart1"
  ? function (t) Heart1ScaleFactor*abs(t-180)/180
  
  : which == "Infinity1"
  ? function (t) .7 * Infinity1ScaleFactor*(sqrt(2*1*(Infinity1Parameter1-1*pow(sin(t),2))))  

  : which == "Misc1"
  ? function (t) Misc1ScaleFactor*sqrt(pow(2*pow(sin(t),Misc1a)*cos(t),2) + pow(2*pow(sin(t),Misc1a)*sin(t) - Misc1b,2))

  : which == "Polygon1"
  ? function (t) Polygon1ScaleFactor*(cos(180/Polygon1SidesNumber))/(cos(t-(360/Polygon1SidesNumber)*floor((Polygon1SidesNumber*t+180)/(360))))

  : which == "Rectangle1"
  ? function (t) Rectangle1ScaleFactor*min(Rectangle1ScaleX/abs(cos(t)),Rectangle1ScaleY/abs(sin(t)))
  
  : which == "Rose1"
  ? function (t)   Rose1ScaleFactor * (Rose1CenterSize + cos(Rose1PedalNumber * t))/(1 + Rose1CenterSize)

  : which == "Square1"
  ? function (t) Square1ScaleFactor*min(1/abs(cos(t)),1/abs(sin(t)))

  : which == "SuperEllipse1"
  ? function (t) SuperEllipse1ScaleFactor*
          pow(
               pow(abs(cos(t)/SuperEllipse1ScaleX),SuperEllipse1n)  +
               pow(abs(sin(t)/SuperEllipse1ScaleY),SuperEllipse1n)
               ,-1/SuperEllipse1n
             )

  : which == "SuperFormula1"
  ? function (t) SuperFormula1ScaleFactor*pow(pow(abs(cos(SuperFormula1m*t/4)/SuperFormula1a),SuperFormula1n2)+pow(abs(sin(SuperFormula1m*t/4)/SuperFormula1b),SuperFormula1n3),(-1/SuperFormula1n1))

  : function (t) 10;    // default case



// given the text string of the shape (e.g. Circle)
// the function returns a function literal e.g.   function (t) t*t*2
topShapeFunctionLiteral = function(which)

  
  which == "Butterfly1"
  ? function (t) .1 * TopButterfly1ScaleFactor*(8-sin(t)+2*sin(3*t)+2*sin(5*t)-sin(7*t)+3*cos(2*t)-2*cos(4*t))

  : which == "Cardiod1"
  ? function (t) TopCardiod1ScaleFactor*(1-sin(t))

  : which == "Cardiod2"
  ? function (t) TopCardiod2ScaleFactor*(.5*(5-4*cos(t)))

  : which == "Cardiod3"
  ? function (t) TopCardiod3ScaleFactor*sqrt(pow(((1-sin(t))*cos(t)),2)+pow(((1-sin(t))*sin(t)+3),2))

  : which == "Circle1"
  ? function (t) TopCircle1ScaleFactor
  
  :which == "Diamond1"
  ? function (t) TopDiamond1ScaleFactor*(1/(abs((1/TopDiamond1ScaleX)*cos(t))+abs((1/TopDiamond1ScaleY)*sin(t))))    

  : which == "Egg1"
  ? function (t) 2*TopEgg1ScaleFactor*pow(sin(t),TopEgg1Width)

  : which == "Egg2"
  ? function (t) TopEgg2ScaleFactor*(pow(cos(t),2) + TopEgg2a * cos(t) + TopEgg2b )

  : which == "Ellipse1"
  ? function (t) TopEllipse1ScaleFactor*TopEllipse1ScaleX*TopEllipse1ScaleY/sqrt(pow(TopEllipse1ScaleY*cos(t),2)+pow(TopEllipse1ScaleX*sin(t),2))

  : which == "Heart1"
  ? function (t) TopHeart1ScaleFactor*abs(t-180)/180

  : which == "Infinity1"
  ? function (t) TopInfinity1ScaleFactor*(sqrt(2*1*(TopInfinity1Parameter1-1*pow(sin(t),2))))

  : which == "Misc1"
  ? function (t) TopMisc1ScaleFactor*sqrt(pow(2*pow(sin(t),TopMisc1a)*cos(t),2) + pow(2*pow(sin(t),TopMisc1a)*sin(t) - TopMisc1b,2))

  : which == "Polygon1"
  ? function (t) TopPolygon1ScaleFactor*(cos(180/TopPolygon1SidesNumber))/(cos(t-(360/TopPolygon1SidesNumber)*floor((TopPolygon1SidesNumber*t+180)/(360))))

  : which == "Rectangle1"
  ? function (t) TopRectangle1ScaleFactor*min(TopRectangle1ScaleX/abs(cos(t)),TopRectangle1ScaleY/abs(sin(t)))

  : which == "Rose1"
  ? function (t) TopRose1ScaleFactor * (TopRose1CenterSize + cos(TopRose1PedalNumber * t))/(1 + TopRose1CenterSize)

  : which == "Square1"
  ? function (t) TopSquare1ScaleFactor*min(1/abs(cos(t)),1/abs(sin(t)))

  : which == "SuperEllipse1"
  ? function (t) TopSuperEllipse1ScaleFactor*
          pow(
               pow(abs(cos(t)/TopSuperEllipse1ScaleX),TopSuperEllipse1n)  +
               pow(abs(sin(t)/TopSuperEllipse1ScaleY),TopSuperEllipse1n)
               ,-1/TopSuperEllipse1n
             )

  : which == "SuperFormula1"
  ? function (t) TopSuperFormula1ScaleFactor*pow(pow(abs(cos(TopSuperFormula1m*t/4)/TopSuperFormula1a),TopSuperFormula1n2)+pow(abs(sin(TopSuperFormula1m*t/4)/TopSuperFormula1b),TopSuperFormula1n3),(-1/TopSuperFormula1n1))

  : function (t) 10;    // default case


  // given bottomShapeSelector (e.g. Circle)
  // Find the shapeOffsetX value for the formula we are using
shapeOffsetX =


   bottomShapeSelector == "Butterfly1"
  ? Butterfly1OffsetX

  : bottomShapeSelector == "Cardiod1"
  ? Cardiod1OffsetX

  : bottomShapeSelector == "Cardiod2"
  ? Cardiod2OffsetX

  : bottomShapeSelector == "Cardiod3"
  ? Cardiod3OffsetX

  : bottomShapeSelector == "Circle1"
  ? Circle1OffsetX

  : bottomShapeSelector == "Diamond1"
  ? Diamond1OffsetX
  
  : bottomShapeSelector == "Egg1"
  ? Egg1OffsetX

  : bottomShapeSelector == "Egg2"
  ? Egg2OffsetX

  : bottomShapeSelector == "Ellipse1"
  ? Ellipse1OffsetX

  : bottomShapeSelector == "Heart1"
  ? Heart1OffsetX
  
  : bottomShapeSelector == "Infinity1"
  ? Infinity1OffsetX  

  : bottomShapeSelector == "Misc1"
  ? Misc1OffsetX

  : bottomShapeSelector == "Polygon1"
  ? Polygon1OffsetX

  : bottomShapeSelector == "Rectangle1"
  ? Rectangle1OffsetX
  
  : bottomShapeSelector == "Rose1"
  ? Rose1OffsetX  

  : bottomShapeSelector == "Square1"
  ? Square1OffsetX

  : bottomShapeSelector == "SuperEllipse1"
  ? SuperEllipse1OffsetX

  : bottomShapeSelector == "SuperFormula1"
  ? SuperFormula1OffsetX

  : -10;    // default case



  // given bottomShapeSelector (e.g. Circle)
  // Find the shapeOffsetY value for the formula we are using
  shapeOffsetY =



   bottomShapeSelector == "Butterfly1"
  ? Butterfly1OffsetY

  : bottomShapeSelector == "Cardiod1"
  ? Cardiod1OffsetY

  : bottomShapeSelector == "Cardiod2"
  ? Cardiod2OffsetY

  : bottomShapeSelector == "Cardiod3"
  ? Cardiod3OffsetY

  : bottomShapeSelector == "Circle1"
  ? Circle1OffsetY

  : bottomShapeSelector == "Diamond1"
  ? Diamond1OffsetY
  
  : bottomShapeSelector == "Egg1"
  ? Egg1OffsetY

  : bottomShapeSelector == "Egg2"
  ? Egg2OffsetY

  : bottomShapeSelector == "Ellipse1"
  ? Ellipse1OffsetY

  : bottomShapeSelector == "Heart1"
  ? Heart1OffsetY
  
  : bottomShapeSelector == "Infinity1"
  ? Infinity1OffsetY  

  : bottomShapeSelector == "Misc1"
  ? Misc1OffsetY

  : bottomShapeSelector == "Polygon1"
  ? Polygon1OffsetY

  : bottomShapeSelector == "Rectangle1"
  ? Rectangle1OffsetY
  
  : bottomShapeSelector == "Rose1"
  ? Rose1OffsetY  

  : bottomShapeSelector == "Square1"
  ? Square1OffsetX

  : bottomShapeSelector == "SuperEllipse1"
  ? SuperEllipse1OffsetX

  : bottomShapeSelector == "SuperFormula1"
  ? SuperFormula1OffsetX

  : -10;    // default case


// get the bottom shape function based on what the user selected for the bottom shape
echo("bottom shape is = ");
// echo out the shape formula we are using
echo(bottomShapeSelector);     // e.g Heart1
// set the bottomShapeFunction() function to the "function literal" for the shape we want  e.g. bottomShapeFunctionLiteral
bottomShapeFunction = bottomShapeFunctionLiteral(bottomShapeSelector);  //   shape = function (t)  Heart1ScaleFactor * abs(t-180)/180
echo("bottom shape function = ");
// echo out the shape formula we are using
echo(bottomShapeFunction);     // e.g the heart shape would ECHO:  function (t) Heart1ScaleFactor*abs(t-180)/180
// given t = 12
// t = 12
// a value could be calculated for the shape function
// value = bottomShapeFunction(t);
// echo(value);


// get the top shape function based on what the user selected for the top shape
echo("top shape is = ");
// echo out the shape formula we are using
echo(topShapeSelector);     // e.g Heart1
// set the topShapeFunction() function to the "function literal" for the shape we want  e.g. bottomShapeFunctionLiteral
topShapeFunction = topShapeFunctionLiteral(topShapeSelector);  //   shape = function (t)  Heart1ScaleFactor * abs(t-180)/180
echo("top shape function = ");
// echo out the shape formula we are using
echo(topShapeFunction);     // e.g the heart shape would ECHO:  function (t) Heart1ScaleFactor*abs(t-180)/180


// set the resolution based on whether we are in preview or render mode
vertical_resolution = $preview ? vertical_resolution_preview : vertical_resolution_render;
radial_resolution = $preview ? radial_resolution_preview : radial_resolution_render;

// set this variable based on it's flag equivalent
morphOn = morphOnFlag ? 1 : 0;

// set this variable based on it's flag equivalent
bezierTwistPointsOn = bezierTwistPointsOnFlag ? 1 : 0;

// if false, set variable to 0
radialRippleDepth2 = radialRippleOn ? radialRippleDepth : 0 ;   // check to see if radialRipple is On or Off

// if false, set variable to 0
verticalRippleDepth2 = verticalRippleOn ? verticalRippleDepth : 0 ;   // check to see if vertical Ripple is On or Off


// if false, set variable to 0
sineTwistCycles2 =  sineTwistOn ? sineTwistCycles : 0;

// if false, set variable to 0
verticalSmoothingCycles2 = verticalSmoothingCyclesOn ? verticalSmoothingCycles : 0 ;

// if false, set variable to 0
radialSmoothingCycles2 = radialSmoothingCyclesOn ? radialSmoothingCycles : 0 ;

// set this variable based on it's flag equivalent
shapePointsOn = shapePointsOnFlag ? 1 : 0;

// set this variable based on it's flag equivalent
bezierOffsetXYPointsOn = bezierOffsetXYPointsOnFlag ? 1 : 0;

// need to alter the shapePoint list in case shapePointsOn==0
// we make a new list called shapePoints2
shapePoints2 = [  for(i= [0:len(shapePoints)-1]) shapePointsOn==1 ? [shapePoints[i][0], shapePoints[i][1] ]  : [ 1.0, shapePoints[i][1] ]   ];


// This seperates out the bezierOffsetXPoints and bezierOffsetYPoints for making Bezier Offset curves below.
// One for the OffsetX and one for the OffsetY curves.
// [a,b] where a is a offset amount, and b is not used as we are assuming equally spaced control points for this item.
//      So we set the b values to 0
// We get the length of the list that the user created above.
bezierOffsetXPoints = [  for(i= [0:len(bezierOffsetXYPoints)-1])   [bezierOffsetXYPoints[i][0] * bezierOffsetXYPointsOn,  0]   ];
bezierOffsetYPoints = [  for(i= [0:len(bezierOffsetXYPoints)-1])   [bezierOffsetXYPoints[i][1] * bezierOffsetXYPointsOn,  0]   ];
//echo(bezierOffsetXPoints);
//echo(bezierOffsetYPoints);

// This creates the list of control points that is needed by the Bezier function.
// [a,b] where a is a twist amount, and b is not used as we are assuming equally spaced control points for this item.
//      So we set the b values to 0
// We get the length of the list that the user created above.
twistPoints = [  for(i= [0:len(bezierTwistPoints)-1])   [bezierTwistPoints[i] * bezierTwistPointsOn,  0]   ];


// This is the 2nd twist function, based on a sine wave for multiple twists.
// Twist: Returns rotation of layer at ratio height v.
function twist(v) = sineTwistMax * sin(sineTwistCycles2 * 0.25 * 360 * v);

// Radial Ripple: Returns offset radially applied to reference radius to form star petals in mm
function radialRipple(v, t) = radialRippleDepth2 * sin((t + twist(v)) * radialRippleCount);

// Vertical Ripple: Returns offset vertically applied to the reference radius to form ripples from top to bottom
function verticalRipple(v, t) = verticalRippleDepth2 * cos(v * 360 * verticalRippleCount);

// Vertical Smoothing: Returns offset vertically applied to reference radius to vary ripple depth.
// Return value varies between 0 and 1; 0 means ripple fully suppressed; 1 means ripple full depth.
function verticalSmoothing(v) = 0.5 + (0.5 * cos(verticalSmoothingCycles2 * 0.5 * 360 * (v + verticalSmoothingStartHeightPercentage/100)));


// Radial Smoothing: Returns a smoothing factor (0-1) based on the angle t (0-360)
// Return value varies between 0 and 1; 0 means ripple fully suppressed; 1 means ripple full depth.
function radialSmoothing(t) = (cos(t * radialSmoothingCycles2 + radialSmoothingOffsetAngle*radialSmoothingCycles2)+1)/2;







// The is the main function that determines the shape of the object. It returns the radial length at v,t (vertical height 0-1, t = theta in degrees)
// It consists of a
//  bottomShapeFunction(t) which defines the main shape of the object (you can see unmodified shape at the bottom of object)
//  bezierRadius which defines the radius of the object in mm at this vertical height v.
//  radialRipple(v,t) which returns a radial offset to add a petal shape to the object
//  verticalSmoothing(v) which smoothes out the both the Vertical Ripples and the Radial Ripples
//  OLD:  function findRadius(v,t) = bottomShapeFunction(t) * bezier(v) + radialRipple(v, t) * verticalSmoothing(v);
//  OLD before morphOn:  function findRadius(bezierRadius, v,t) =  (bottomShapeFunction(t)*(1-v) + topShapeFunction(t)*(v)) * bezierRadius + radialRipple(v, t) * verticalSmoothing(v);
function findRadius(bezierRadius, v, t) =  (morphOn==1 ? (bottomShapeFunction(t)*(1-v) + topShapeFunction(t)*(v)) : bottomShapeFunction(t)) * bezierRadius + radialRipple(v, t) * verticalSmoothing(v) * radialSmoothing(t) + verticalRipple(v,t) * verticalSmoothing(v) * radialSmoothing(t);


// convert polar r,θ coordinates to cartesian x or y
function x(r, t) = r * cos(t);
function y(r, t) = r * sin(t);

// polar to rectangular... given(r,degrees)  returns list [x,y]
function pol2rect(r,d) = [r*cos(d),r*sin(d)];

// rotate point x,y,z by θ  (only on x-y plane)
// pass in a vector v with  [x,y,z,θ]
// return a vector with  [x', y', z]   where x',y' are x,y rotated by θ
// z does not change
// here are the equations for the x,y rotated by θ
// from https://www.siggraph.org/education/materials/HyperGraph/modeling/mod_tran/2drota.htm
// x' = x cos θ - y sin θ
// y' = y cos θ + x sin θ
function rot(v)= [
  v[0]*cos(v[3]) - v[1]*sin(v[3]),  // x'
  v[1]*cos(v[3]) + v[0]*sin(v[3]),  // y'
  v[2]                              // z
];



module makeObject() {

  // step vertically up the vase
  for  (vStep = [0:vertical_resolution - 1]) {
    // m0 and m1 are points along the besier curve... these are not equally spaced vertically.
    // m ranges in value from 0.0 to 1.0, where 0.0 is the curve at the bottom of the object
    // and 1.0 is the point on the curve at the top of the object.
    // the bezierRH(m) function is passed the m value, and it returns the radius and the height at this m value.


    m0 = vStep/vertical_resolution;          // m value at the bottom of this section
    m1 = (vStep+1)/vertical_resolution;      // m value at the top of this section
    //rh0 = bezier(r0,h0,r1,h1,r2,h2,r3,h3,m0);   // find the [radius, height] at m0
    rh0 = PointAlongBez(m0, shapePoints2);    // find the [radius, height] at m0
    shapeRadius0 = rh0[0] * shapeDefaultRadius;                           // radius at m0, in mm
    height0 = rh0[1] * shapeDefaultHeight;                           // height at m0, in mm
    //rh1 = bezier(r0,h0,r1,h1,r2,h2,r3,h3,m1);   // find the [radius, height] at m1
    rh1 = PointAlongBez(m1, shapePoints2);    // find the [radius, height] at m0
    shapeRadius1 = rh1[0] * shapeDefaultRadius;                           // radius at m1, in mm
    height1 = rh1[1] * shapeDefaultHeight;                           // height at m1, in mm


    //echo(h1-h0);

    // height of the bottom and top of exterior face, expressed as ratio of full height (0-1)
    v0 = height0 / shapeDefaultHeight;
    v1 = height1 / shapeDefaultHeight;

  	// height of the bottom and top exterior face, expressed in output units (0-height)
    //h0 = v0 * height;
    //h1 = v1 * height;

    // find the center point of the slice of pie
    centerTopX = PointAlongBez(v1, bezierOffsetXPoints)[0] * bezierOffsetX + fixedOffsetX + shapeOffsetX;
    centerTopY = PointAlongBez(v1, bezierOffsetYPoints)[0] * bezierOffsetY + fixedOffsetY + shapeOffsetY;

    centerBotX = PointAlongBez(v0, bezierOffsetXPoints)[0] * bezierOffsetX + fixedOffsetX + shapeOffsetX;
    centerBotY = PointAlongBez(v0, bezierOffsetYPoints)[0] * bezierOffsetY + fixedOffsetY + shapeOffsetY;


    //    echo (centerTopX);
    //    echo (centerTopY);

    // we will add the Bezier twist, based on the vertical values and the Bezier curve for twist
    rotBot = PointAlongBez(v0, twistPoints)[0]; // in degrees (0-twistDegrees minus one step)
    rotTop = PointAlongBez(v1, twistPoints)[0]; // in degrees (0-twistDegrees minus one step)
    //rotBot = twistBezier(v0)[0];    // in degrees (0-twistDegrees minus one step)
    //rotTop = twistBezier(v1)[0];    // in degrees (0-twistDegrees)


    // step around all angles of the vase
    for (t = [0:radial_resolution - 1]) {
      // angles to either horizontal side of this exterior face, in degrees
      t0 = t * 360 / radial_resolution;    //(0-359)
      t1 = (t + 1) * 360 / radial_resolution;    //(0-359)
      // radii from axis to each corner of this exterior face:
      rv0t0 = findRadius(shapeRadius0, v0, t0);  // radius at bottom left
      rv0t1 = findRadius(shapeRadius0, v0, t1);  // radius at bottom right
      rv1t0 = findRadius(shapeRadius1, v1, t0);  // radius at top left
      rv1t1 = findRadius(shapeRadius1, v1, t1);  // radius at top right



      // this builds a slice of pie shape from the center of all of our offsets and rotation.
      // The outer edge of the pie is also offset by fixedOffset + shapeOffset + bezierOffset.
      // And then we also rotate the edge by the bezierTwist.
      // create a pie slice polyhedron, defining the 6 points of [x,y,z], and 8 faces
      polyhedron(
          points = [
              rot([centerTopX, centerTopY, height1, rotTop]),                       // center top of slice, rotated bezier rotation amount
              rot([centerBotX, centerBotY, height0, rotBot]),                       // center bottom of slice, rotated bezier rotation amount
              rot([x(rv1t0, t0) + centerTopX, y(rv1t0, t0) + centerTopY, height1, rotTop]), // exterior left top of slice
              rot([x(rv0t0, t0) + centerBotX, y(rv0t0, t0) + centerBotY, height0, rotBot]), // exterior left bottom of slice
              rot([x(rv1t1, t1) + centerTopX, y(rv1t1, t1) + centerTopY, height1, rotTop]), // exterior right top of slice
              rot([x(rv0t1, t1) + centerBotX, y(rv0t1, t1) + centerBotY, height0, rotBot])  // exterior right bottom of slice
          ],
          faces = [  // clockwise as seen from outside (all triangles)
              [0, 2, 4], // top face of slice
              [1, 5, 3], // bottom face of slice
              [0, 3, 2], // left top face of slice
              [0, 1, 3], // left bottom face of slice
              [0, 4, 5], // right top face of slice
              [0, 5, 1], // right bottom face of slice
              [2, 3, 4], // exterior left face of slice
              [5, 4, 3]  // exterior right face of slice
          ]
      ); // end of polyhedron
    } // end of for (t - radial
  } // end of for(v - vertical
} // end of module makeObject()


// this makes our object
makeObject();



/*
module Constraints() {
	translate([0, 0, -0.5]) cylinder(r = base_radius, h = 1);
	translate([0, 0, height / 3 - 0.5]) cylinder(r = waist_radius, h = 1);
	translate([0, 0, 2 * height / 3 - 0.5]) cylinder(r = neck_radius, h = 1);
	translate([0, 0, height - 0.5]) cylinder(r = top_radius, h = 1);
}
display_diameters = 1;          // put this as a parameter at the top of this file, to use this feature.
if (display_diameters == 1) {
	% Constraints();
}
*/




// This was an attempt at making a shell...  took forever to even do a preview
/*// Universe cube must be bigger than part being loaded
universe_x = 1000;
universe_y = 1000;
universe_z = 1000;

// t is thickness of shell
t = 1;

// Name of part to convert to shell (must be in same directory)
//part_to_shell = "DemoPiece.stl";

difference() {

  intersection() {
      // let's make the object
      makeObject();
      minkowski() {
          difference () {
              // Universe cube
              //translate([-universe_x/2, -universe_y/2, -universe_z/2 ])
              cube([universe_x, universe_y, universe_z],center=true);
              // Original part
              //import(part_to_shell);
              makeObject();
          }
          // Tool for the minkowski shell
          sphere(r=t, center=true);
      }
  }

   translate([0,0,65]) linear_extrude(20)  circle(100);


}*/
