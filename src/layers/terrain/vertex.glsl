#version 300 es

in vec3 uvw;
uniform mat4 projection;
uniform mat4 model_view;
uniform ivec3 xyz;
uniform ivec3 camera;
uniform sampler2D terrain;
uniform int downsample_imagery;
uniform int downsample_terrain;
out vec2 uv;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);
const float CIRCUMFERENCE = 40075017.;

vec2 downsample(int downsample) {
    float k = pow(2., float(downsample));
    return (mod(vec2(xyz.xy), k) + uvw.xy) / k;
}

void main(void) {
    vec4 e = texture(terrain, downsample(downsample_terrain));
    float t = (((256. * 256. * 255. * e.r) + (256. * 255. * e.g) + (255. * e.b)) / 10. - 10000.) / CIRCUMFERENCE;

    int k = int(pow(2., float(xyz.z)));
    ivec3 q = ivec3(uvw * float(ONE / k)) + ivec3(xyz.xy * (ONE / k), int(t * float(ONE)));
    gl_Position = projection * model_view * vec4(vec3(q - camera) * INV_ONE, 1.);

    uv = downsample(downsample_imagery);
}
