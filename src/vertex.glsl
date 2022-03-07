attribute vec2 uv;
uniform mat4 modelView;
uniform mat4 projection;
uniform vec3 xyz;
uniform vec3 camera;

varying highp vec2 uvOut;

const float a = 6371.;
const float b = 6357.;

vec3 ecef(vec3 position) {
    float sx = sin(position.x);
    float cx = cos(position.x);
    float sy = sin(position.y);
    float cy = cos(position.y);
    float z = position.z;
    float n = 1. / sqrt(a * a * cy * cy + b * b * sy * sy);
    return vec3(
        (n * a * a + z) * cx * cy,
        (n * a * a + z) * sx * cy,
        (n * b * b + z) * sy);
}

float sinh(float x) {
    return 0.5 * (exp(x) - exp(-x));
}

void main(void) {
    vec2 q = (xyz.xy + uv) /  pow(2., xyz.z - 1.) - 1.;
    vec3 ground = vec3(
        radians(q.x * 180.),
        atan(sinh(-radians(180.) * q.y)), 
        0.);

    float sx = sin(camera.x);
    float cx = cos(camera.x);
    float sy = sin(camera.y);
    float cy = cos(camera.y);

    vec3 enu = (ecef(ground) - ecef(camera)) * mat3(
        -sx, cx, 0.,
        -cx * sy, -sx * sy, cy,
        cx * cy, sx * cy, sy
    );

    gl_Position = projection * modelView * vec4(enu, 1.);
    uvOut = uv;
}
