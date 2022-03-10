attribute vec2 uv;
uniform mat4 projection;
uniform ivec3 xyz;
uniform ivec3 camera;

varying vec2 uvOut;

const int ONE = 1073741824; // 2^30
const float ZSCALE = 1e9;

void main(void) {
    int k = int(pow(2., float(xyz.z)));
    ivec3 q = ivec3(
        xyz.xy * (ONE / k) 
            + ivec2(uv * float(ONE / k)) 
            - ivec2(ONE/2, ONE/2), 
        0.);
    gl_Position = projection * vec4(vec3(q - camera) * vec3(1. / float(ONE), -1. / float(ONE), 1. / ZSCALE), 1.);
    uvOut = uv;
}