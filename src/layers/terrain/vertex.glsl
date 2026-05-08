#version 300 es

precision highp float;

uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 xyz;
uniform ivec3 camera;
uniform sampler2D terrain;
uniform int downsample_imagery;
uniform int downsample_overlay;
uniform int downsample_terrain;
uniform vec4 color;

in vec3 uvw;
out vec2 uv;
out vec2 uv_overlay;
out vec4 color_out;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1.f / float(ONE);
const float CIRCUMFERENCE = 40075017.f;

vec2 downsample(int downsample) {
    float k = pow(2.f, float(downsample));
    return (mod(vec2(xyz.xy), k) + uvw.xy) / k;
}

void main(void) {
    vec4 e = texture(terrain, downsample(downsample_terrain));
    float t = (((256.f * 256.f * 255.f * e.r) + (256.f * 255.f * e.g) + (255.f * e.b)) / 10.f - 10000.f) / CIRCUMFERENCE;

    int k = int(pow(2.f, float(xyz.z)));
    ivec3 q = ivec3(uvw * float(ONE / k)) + ivec3(xyz.xy * (ONE / k), int(t * float(ONE)));
    gl_Position = projection * model_view * vec4(vec3(q - camera) * INV_ONE, 1.f);

    uv = downsample(downsample_imagery);
    uv_overlay = downsample(downsample_overlay);
    color_out = color;
}
