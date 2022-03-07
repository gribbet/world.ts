attribute vec2 textureCoordinate;
uniform mat4 modelView;
uniform mat4 projection;
uniform float x;
uniform float y;
uniform float z;
uniform vec3 camera;

varying highp vec2 textureCoordinateOut;

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

void main(void) {
    float longitude = (x + textureCoordinate.x) * 180. * 2. / pow(2., z) - 180.;
    float latitude = -(y + textureCoordinate.y) * 85.0511 * 2. / pow(2., z) + 85.0511;
    vec3 ground = vec3(radians(longitude), radians(latitude), 0.);

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
    textureCoordinateOut = textureCoordinate;
}