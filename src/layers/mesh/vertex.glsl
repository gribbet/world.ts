#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform vec2 screen;
uniform ivec3 position;
uniform vec4 orientation;
uniform vec4 color;

in vec3 vertex;
out vec4 color_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);

void main(void) {
    gl_Position = projection * model_view * vec4(vec3(position - camera) * INV_ONE + vertex, 1.);

    color_out = color;
}
