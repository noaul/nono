import assert from 'node:assert/strict'
import test from 'node:test'

import { FLOOR_ID, MOMO, NONO, createPet, step, withPeerHeads, type PetInput, type PetState, type Platform, type Species, type Terrain } from '../src/app/(home)/desk-pet/desk-pet-model.ts'
import { createSocial, socialStep, type SocialState } from '../src/app/(home)/desk-pet/desk-pet-social.ts'
import { readPetPrefs } from '../src/app/(home)/desk-pet/desk-pet-prefs.ts'

const constant = (value: number) => () => value
const awake = { sleepy: false, reducedMotion: false }
const petInput: PetInput = { sleepy: false, panelKey: null, reducedMotion: false, compact: false, restSlot: 0 }
const clock: Platform = { id: 'clock', y: 300, x1: 400, x2: 700 }
const terrain: Terrain = { width: 1000, height: 800, platforms: [{ id: FLOOR_ID, y: 800, x1: 0, x2: 1000 }, clock], walls: [], ceilings: [] }

function placeOn(id: string, x: number, species: Species): PetState {
	const platform = terrain.platforms.find(item => item.id === id)!
	const pet = createPet(terrain, species, constant(0.5))
	return { ...pet, x, y: platform.y - pet.height / 2, surface: { kind: 'platform', id }, pose: 'idle' }
}

const quiet = (overrides: Partial<SocialState> = {}): SocialState => ({ ...createSocial(constant(0.5)), checkIn: 0, greetCooldown: 99, stackCooldown: 99, nextChaseIn: 99, ...overrides })

test('pets that meet say hello and face each other', () => {
	const result = socialStep([placeOn('clock', 520, NONO), placeOn('clock', 570, MOMO)], quiet({ greetCooldown: 0 }), 0.016, terrain, awake, constant(0.5))
	const [nono, momo] = result.pets

	assert.deepEqual([nono.pose, momo.pose], ['happy', 'happy'])
	assert.deepEqual([nono.facing, momo.facing], ['right', 'left'])
	assert.deepEqual(result.speech.map(item => [item.petId, item.delayMs]), [['nono', 0], ['momo', 1200]])
	assert.equal(result.social.greetCooldown, 25)
})

test('leaves sleeping pets alone', () => {
	const pets = [placeOn('clock', 520, NONO), placeOn('clock', 570, MOMO)]
	const result = socialStep(pets, quiet({ greetCooldown: 0, nextChaseIn: 0 }), 0.016, terrain, { ...awake, sleepy: true }, constant(0.5))

	assert.deepEqual(result.pets, pets)
	assert.equal(result.social.chase, null)
	assert.deepEqual(result.speech, [])
})

test('starts a chase: the chaser calls out and the other runs away', () => {
	const result = socialStep([placeOn('clock', 430, NONO), placeOn('clock', 600, MOMO)], quiet({ nextChaseIn: 0 }), 0.016, terrain, awake, constant(0.3))

	assert.deepEqual(result.social.chase && [result.social.chase.chaserId, result.social.chase.targetId], ['nono', 'momo'])
	assert.equal(result.pets[1].pose, 'run')
	assert.equal(result.pets[1].walkTo, 700 - MOMO.size.width / 2)
	assert.deepEqual(result.speech.map(item => item.text), ['等等我！', '抓不到～'])
})

test('the chaser follows the target to another platform', () => {
	const chase = { chaserId: 'momo', targetId: 'nono', time: 1 }
	const result = socialStep([placeOn('clock', 550, NONO), placeOn(FLOOR_ID, 300, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.pets[1].goalId, 'clock')
})

test('catching up ends the chase with a happy hop', () => {
	const chase = { chaserId: 'nono', targetId: 'momo', time: 3 }
	const result = socialStep([placeOn('clock', 540, NONO), placeOn('clock', 560, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.social.chase, null)
	assert.deepEqual(result.pets.map(pet => pet.pose), ['happy', 'happy'])
	assert.ok(result.social.nextChaseIn >= 60)
	assert.deepEqual(result.speech.map(item => item.text), ['抓到啦！'])
})

test('a chase that drags on is called off', () => {
	const chase = { chaserId: 'nono', targetId: 'momo', time: 13 }
	const result = socialStep([placeOn('clock', 420, NONO), placeOn(FLOOR_ID, 900, MOMO)], quiet({ chase }), 0.016, terrain, awake, constant(0.5))

	assert.equal(result.social.chase, null)
})

test('one pet jumps onto the other and rides on its head', () => {
	let pets = [placeOn(FLOOR_ID, 500, NONO), placeOn(FLOOR_ID, 560, MOMO)]
	const result = socialStep(pets, quiet({ stackCooldown: 0 }), 0.016, terrain, awake, constant(0.05))

	assert.equal(result.pets[0].pose, 'crouch')
	assert.equal(result.pets[1].walkTo, null)
	assert.deepEqual(result.speech.map(item => item.text), ['嘿咻！'])
	assert.equal(result.social.stackCooldown, 45)

	pets = result.pets
	for (let elapsed = 0; elapsed < 1.5; elapsed += 1 / 60) {
		pets = pets.map(pet => step(pet, 1 / 60, withPeerHeads(terrain, pets, pet), petInput, constant(0.5)).state)
	}
	assert.deepEqual(pets[0].surface, { kind: 'platform', id: 'pet:momo' })
})

test('reads pet preferences with a legacy fallback', () => {
	assert.deepEqual(readPetPrefs(null, null), { nono: true, momo: true })
	assert.deepEqual(readPetPrefs(null, 'false'), { nono: false, momo: false })
	assert.deepEqual(readPetPrefs('{"nono":false,"momo":true}', 'false'), { nono: false, momo: true })
	assert.deepEqual(readPetPrefs('not json', null), { nono: true, momo: true })
})
