attribute vec2 uv;
uniform mat4 projection;
uniform mat4 modelView;
uniform ivec3 xyz;
uniform ivec3 camera;
uniform sampler2D terrain;

varying vec2 uvOut;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);
const float CIRCUMFERENCE = 40075017.;

void main(void) {
    int k = int(pow(2., float(xyz.z)));
    vec4 e = texture2D(terrain, uv);
    float t = (256. * 256. * 256. * e.r + 256. * 256. * e.g + 256. * e.b - 100000.) * 0.1 / CIRCUMFERENCE;
    ivec3 q = ivec3(
        xyz.xy * (ONE / k) 
            + ivec2(uv * float(ONE / k)) 
            - ivec2(ONE/2, ONE/2), 
        int(t * float(ONE)));
    gl_Position = projection * modelView * vec4(vec3(q - camera) * INV_ONE * vec3(1., -1., 1.), 1.);
    uvOut = uv;
}