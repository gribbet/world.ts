#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform float range;
uniform ivec3 position;
uniform mat4 orientation;

in vec2 uv;
out vec2 uv_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);
const float CIRCUMFERENCE = 40075017.;

vec4 transform(vec3 v) {
    return projection * model_view * vec4(vec3(position - camera) * INV_ONE + v, 1.f);
}

void main(void) {
    vec4 q = orientation * vec4(vec3(uv.x, 0, uv.y) * range / CIRCUMFERENCE, 1.f);
    gl_Position = transform(q.xyz / q.w);
    uv_out = uv;
}