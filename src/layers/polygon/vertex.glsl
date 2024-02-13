#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform ivec3 center;
uniform vec2 screen;
uniform vec4 color;

in vec3 position;
out vec4 color_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);

vec4 transform(vec3 v) {
    return projection * model_view * vec4(vec3(ivec3(v * float(ONE)) + center - camera) * INV_ONE, 1.f);
}

void main(void) {
    gl_Position = transform(position);
    color_out = color;
}
