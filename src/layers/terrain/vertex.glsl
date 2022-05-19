attribute vec3 uvw;
uniform mat4 projection;
uniform mat4 modelView;
uniform ivec3 xyz;
uniform ivec3 camera;
uniform sampler2D terrain;
uniform int downsampleTerrain;
uniform int downsampleImagery;
varying vec2 uvOut;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);
const float CIRCUMFERENCE = 40075017.;

vec2 downsample(int downsample) {
    float k = pow(2., float(downsample));
    return (mod(vec2(xyz.xy), k) + uvw.xy) / k;
}

void main(void) {
    vec4 e = texture2D(terrain, downsample(downsampleTerrain));
    float t = (((256. * 256. * 255. * e.r) + (256. * 255. * e.g) + (255. * e.b)) / 10. - 10000.) / CIRCUMFERENCE;

    int k = int(pow(2., float(xyz.z)));
    ivec3 q = ivec3(uvw * float(ONE / k)) + ivec3(xyz.xy * (ONE / k), int(t * float(ONE)));
    gl_Position = projection * modelView * vec4(vec3(q - camera) * INV_ONE, 1.);

    uvOut = downsample(downsampleImagery);
}
