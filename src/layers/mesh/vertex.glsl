#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform vec2 screen;
uniform ivec3 position;
uniform mat4 orientation;
uniform vec4 color;
uniform float size;
uniform float min_size_pixels;
uniform float max_size_pixels;

in vec3 vertex;
out vec4 color_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);

vec4 transform(vec3 v) {
    return projection * model_view * vec4(vec3(position - camera) * INV_ONE + v, 1.f);
}

void main(void) {
    vec4 projected = transform(vec3(0.f, 0.f, 0.f));
    float pixel_size = projected.w / screen.y / -projection[1][1];
    float scale = clamp(size, min_size_pixels * pixel_size, max_size_pixels * pixel_size);

    vec4 q = orientation * vec4(vertex * scale, 1.f);
    gl_Position = transform(q.xyz / q.w);

    color_out = color;
}
