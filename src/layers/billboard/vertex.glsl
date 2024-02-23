#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 camera;
uniform vec2 screen;
uniform vec2 image_size;
uniform ivec3 position;
uniform vec4 color;
uniform float size;
uniform float min_size_pixels;
uniform float max_size_pixels;


in vec2 corner;
in vec2 uv;
out vec2 uv_out;
out vec4 color_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);
const float CIRCUMFERENCE = 40075017.;

void main(void) {
    vec4 projected = projection * model_view * vec4(vec3(position - camera) * INV_ONE, 1.f);

    float pixel_size = projected.w / screen.y;
    float scale = clamp(size / CIRCUMFERENCE * -projection[1][1], min_size_pixels * pixel_size, max_size_pixels * pixel_size);

    gl_Position = projected + scale * screen.y / image_size.y * vec4(corner * image_size / screen, 0.f, 0.0f);

    uv_out = uv;
    color_out = color;
}
