attribute vec3 uvw;
uniform mat4 projection;
uniform mat4 modelView;
uniform ivec3 xyz;
uniform ivec3 center;
uniform sampler2D terrain;

varying vec2 uvOut;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);
const float CIRCUMFERENCE = 40075017.;

void main(void) {
    int k = int(pow(2., float(xyz.z)));
    vec4 e = texture2D(terrain, uvw.xy);
    float t = (((256. * 256. * 255. * e.r) + (256. * 255. * e.g) + (255. * e.b)) / 10. - 10000.) / CIRCUMFERENCE;
    ivec3 q = ivec3(uvw * float(ONE / k)) + ivec3(xyz.xy * (ONE / k), int(t * float(ONE)));
    gl_Position = projection * modelView * vec4(vec3(q - center) * INV_ONE * vec3(1., 1., 1.), 1.);
    uvOut = uvw.xy;
}