attribute vec3 position;
uniform mat4 projection;
uniform mat4 modelView;
uniform ivec3 camera;
uniform ivec3 center;

const int ONE = 1073741824; // 2^30
const float INV_ONE = 1. / float(ONE);

void main(void) {
    gl_Position = projection * modelView * vec4(vec3(ivec3(position * float(ONE)) + center - camera) * INV_ONE, 1.);
}
