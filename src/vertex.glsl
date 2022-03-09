attribute vec2 uv;
uniform mat4 projection;
uniform ivec3 xyz;
uniform ivec3 camera;

varying vec2 uvOut;


int o = 1073741824; // 2^30
float f2 = pow(2., -31.);

int f = 2147483648; // 2^31;

void main(void) {
    float k = pow(2., float(31 - xyz.z));
    ivec3 q = ivec3(xyz.xy * int(k) + ivec2(uv * k) - ivec2(o, o), 0.);

    gl_Position = projection * vec4(vec3(q - camera) * vec3(f2, -f2, 1e-6), 1.);
    uvOut = uv;
}