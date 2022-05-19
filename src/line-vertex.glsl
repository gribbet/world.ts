uniform mat4 projection;
uniform mat4 modelView;
uniform ivec3 camera;
uniform ivec3 center;
uniform vec2 screen;
uniform float thickness;
uniform vec4 color;

attribute vec3 previous;
attribute vec3 current;
attribute vec3 next;
attribute vec2 corner;

varying vec4 colorOut;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);

vec4 transform(vec3 position) {
    return projection * modelView * vec4(vec3(ivec3(position * float(ONE)) + center - camera) * INV_ONE, 1.);
}

void main(void) {
    vec4 projectedPrevious = transform(previous);
    vec4 projectedCurrent = transform(current);
    vec4 projectedNext = transform(next);

    vec2 screenPrevious = projectedPrevious.xy / projectedPrevious.w * screen;
    vec2 screenCurrent = projectedCurrent.xy / projectedCurrent.w * screen;
    vec2 screenNext = projectedNext.xy / projectedNext.w * screen;

    vec2 a = normalize(screenCurrent - screenPrevious);
    vec2 b = normalize(screenNext - screenCurrent);
    if(screenCurrent == screenPrevious)
        a = b;
    if(screenNext == screenCurrent)
        b = a;
    vec2 direction = normalize(a + b);
    vec2 point = normalize(a - b);
    vec2 normal = vec2(-direction.y, direction.x);
    vec2 offset;

    if(sign(corner.y * dot(normal, point)) > 0.0) {
        vec2 ap = vec2(-a.y, a.x);
        vec2 bp = vec2(-b.y, b.x);
        offset = 0.5 * corner.y * (corner.x * (bp - ap) + ap + bp);
    } else {
        float distance = 1. / dot(direction, a);
        offset = normal * distance * corner.y;
    }

    gl_Position = projectedCurrent + thickness * vec4(offset / screen * projectedCurrent.w, 0., 0.);

    colorOut = color;
}
