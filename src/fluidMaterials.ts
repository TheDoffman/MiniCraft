import * as THREE from 'three';

/** Shared time uniform for water shimmer and lava pulse (updated from the main loop). */
export const waterShimmerUniforms = { uWaterTime: { value: 0 } };

export function attachWaterDepthMurkShader(/** @type {THREE.MeshLambertMaterial} */ mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterShimmerUniforms.uWaterTime;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute float waterDepth;
attribute vec2 waterFlow;
varying float vWaterDepth;
varying vec2 vWaterFlow;
`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vWaterDepth = waterDepth;
vWaterFlow = waterFlow;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform float uWaterTime;
varying vec2 vWaterFlow;
`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
		float _wt = uWaterTime;
	vec2 _cell = floor(vMapUv * 16.0 + 0.0001);
	vec2 _loc = fract(vMapUv * 16.0);
	vec2 _flow = vec2(_wt * 0.02, _wt * 0.015) + vWaterFlow * 0.078;
	vec2 _tf = fract(_loc + _flow);
	vec2 _wShUv = (_cell + _tf) / 16.0;
	vec4 sampledDiffuseColor = texture2D( map, _wShUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <color_pars_fragment>',
        `#include <color_pars_fragment>
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
	float wd = clamp( vWaterDepth, 0.0, 1.0 );
	float murk = 1.0 - exp( -wd * 4.8 );
	vec3 deepCol = vec3( 0.035, 0.12, 0.2 );
	diffuseColor.rgb = mix( diffuseColor.rgb, deepCol, murk * 0.9 );
	float a1 = diffuseColor.a + murk * 0.52;
	diffuseColor.a = min( a1, 0.94 );
}
`,
      );
  };
}

export function attachLavaDepthMurkShader(/** @type {THREE.MeshLambertMaterial} */ mat) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterShimmerUniforms.uWaterTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <color_pars_vertex>',
        `#include <color_pars_vertex>
attribute float waterDepth;
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
vWaterDepth = waterDepth;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
uniform float uWaterTime;
`,
      )
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
		float _wt = uWaterTime;
	vec2 _cell = floor(vMapUv * 16.0 + 0.0001);
	vec2 _loc = fract(vMapUv * 16.0);
	vec2 _flow = vec2(_wt * -0.026, _wt * 0.019);
	vec2 _tf = fract(_loc + _flow);
	vec2 _lShUv = (_cell + _tf) / 16.0;
	vec4 sampledDiffuseColor = texture2D( map, _lShUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,
      )
      .replace(
        '#include <color_pars_fragment>',
        `#include <color_pars_fragment>
varying float vWaterDepth;
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
	float wd = clamp( vWaterDepth, 0.0, 1.0 );
	float murk = 1.0 - exp( -wd * 3.6 );
	vec3 deepCol = vec3( 0.14, 0.02, 0.0 );
	diffuseColor.rgb = mix( diffuseColor.rgb, deepCol, murk * 0.82 );
	float a1 = diffuseColor.a + murk * 0.42;
	diffuseColor.a = min( a1, 0.92 );
}
`,
      )
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	vec3 lavaAlb = diffuseColor.rgb;
	float lavaHot = max( lavaAlb.r, max( lavaAlb.g * 0.58, lavaAlb.b * 0.22 ) );
	float lavaPulse = 0.88 + 0.12 * sin( uWaterTime * 2.6 + lavaHot * 5.5 );
	vec3 lavaGlowTint = vec3( 1.0, 0.4, 0.1 );
	outgoingLight += lavaGlowTint * lavaHot * lavaHot * ( 1.25 * lavaPulse );
`,
      );
  };
}
