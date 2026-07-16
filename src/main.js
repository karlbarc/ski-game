import * as THREE from 'three';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
renderer.setClearColor(0xbfdcf5);
renderer.render(new THREE.Scene(), new THREE.PerspectiveCamera());
console.log('ski-game scaffold OK');
