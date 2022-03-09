attribute vec2 uv;
uniform mat4 projection;
uniform ivec3 xyz;
uniform ivec3 camera;

varying vec2 uvOut;

const float r = 6371.;

int o = int(pow(2., 30.));
float f = pow(2., -31.);

float sinh(float x) {
    return 0.5 * (exp(x) - exp(-x));
}

vec3 ecef(ivec3 q) {
    vec3 b = vec3(q) * vec3(f, f, 1e-4);
    vec3 a = vec3(
        radians(180.) * 2. * b.x, 
        atan(sinh(-radians(180.) * 2. * b.y)),
        b.z);
    float sx = sin(a.x);
    float cx = cos(a.x);
    float sy = sin(a.y);
    float cy = cos(a.y);
    float n = r / sqrt(cy * cy + sy * sy);
    return vec3(
        (n + a.z) * cx * cy,
        (n + a.z) * sx * cy,
        (n + a.z) * sy);
}


void main(void) {
    float k = pow(2., float(31 - xyz.z));
    ivec3 q = ivec3(xyz.xy * int(k) + ivec2(uv * k) - ivec2(o, o), 0);

    vec3 enu = (ecef(q - ivec3(camera.xy, 0)) - vec3(r + float(camera.z) * 1e-3, 0., 0.)) * mat3(
        0., 1., 0.,
        0., 0., 1.,
        1., 0., 0.
    );

    gl_Position = projection * vec4(enu, 1.);
    uvOut = uv;
}
