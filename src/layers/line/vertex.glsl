#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform vec2 screen;
uniform vec4 color;
uniform float width;
uniform float min_width_pixels;
uniform float max_width_pixels;
uniform float time;

in ivec3 previous;
in ivec3 current;
in ivec3 next;
in vec2 corner;
in float distance;
out vec4 color_out;
out float distance_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);
const float CIRCUMFERENCE = 40075017.;

vec4 transform(ivec3 v) {
    return projection * model_view * vec4(vec3(v - camera) * INV_ONE, 1.f);
}

void main(void) {
    vec4 projected_previous = transform(previous);
    vec4 projected_current = transform(current);
    vec4 projected_next = transform(next);

    vec2 screen_previous = projected_previous.xy / abs(projected_previous.w) * screen;
    vec2 screen_current = projected_current.xy / abs(projected_current.w) * screen;
    vec2 screen_next = projected_next.xy / abs(projected_next.w) * screen;

    vec2 a = normalize(screen_current - screen_previous);
    vec2 b = normalize(screen_next - screen_current);
    if(screen_current == screen_previous)
        a = b;
    if(screen_next == screen_current)
        b = a;
    vec2 direction = normalize(a + b);
    vec2 point = normalize(a - b);
    vec2 normal = vec2(-direction.y, direction.x);
    vec2 offset;

    if(sign(corner.y * dot(normal, point)) > 0.0f) {
        vec2 ap = vec2(-a.y, a.x);
        vec2 bp = vec2(-b.y, b.x);
        offset = 0.5f * corner.y * (corner.x * (bp - ap) + ap + bp);
    } else {
        float distance = clamp(1.f / cos(acos(clamp(dot(a, b), -1.f, 1.f))/ 2.f), 0.f, 1.f);
        offset = normal * distance * corner.y;
    }

    float pixel_size = abs(projected_current.w) / screen.y;
    float scale = clamp(width / CIRCUMFERENCE * -projection[1][1], min_width_pixels * pixel_size, max_width_pixels * pixel_size) ;

    gl_Position = projected_current + 0.5 * vec4(scale * offset, 0.f, 0.f);

    color_out = color;
    distance_out = distance;
}
