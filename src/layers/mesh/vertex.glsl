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
const float INV_ONE = 1. / float(ONE);

vec4 transform(vec4 v) {
    return projection * model_view * (vec4(vec3(position - camera) * INV_ONE, 1.) + v);
}

void main(void) {
   float pixel_size = transform(vec4(0., 0., 0., 0.)).w / length(screen);
    float size_pixels = clamp(size / pixel_size, min_size_pixels, max_size_pixels);
    float scale = size_pixels * pixel_size;

    gl_Position = transform(orientation * vec4(vertex * scale, 1.));

    color_out = color;
}
