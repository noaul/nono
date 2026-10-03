/**
 * Pet-to-pet interactions for the desk pets: greetings, chases and stacking.
 * Pure like the model; it only issues commands that the model then carries out.
 */
import {
	FLOOR_ID,
	cheer,
	headPlatform,
	holdStill,
	isPetPlatform,
	runTo,
	setGoal,
	travelToPlatform,
	withPeerHeads,
	type PetState,
	type Platform,
	type Rng,
	type Terrain
} from './desk-pet-model.ts'

export type SocialState = {
	chase: { chaserId: string; targetId: string; time: number } | null
	nextChaseIn: number
	greetCooldown: number
	stackCooldown: number
	checkIn: number
}
export type SocialSpeech = { petId: string; text: string; delayMs: number }
export type SocialInput = { sleepy: boolean; reducedMotion: boolean }

const CHECK_INTERVAL = 0.3
const GREET_DISTANCE = 70
const GREET_COOLDOWN = 25
const STACK_DISTANCE = 90
const STACK_CHANCE = 0.08
const STACK_COOLDOWN = 45
const STACK_WAIT = 2.5
const CATCH_DISTANCE = 36
const FLEE_DISTANCE = 120
const CHASE_TIMEOUT = 12
const REPLY_DELAY_MS = 1200
const TAUNT_DELAY_MS = 900

const GREETINGS: Record<string, string[]> = {
	nono: ['嗨 Momo～', '一起玩吗？', '今天也很可爱嘛'],
	momo: ['喵～', '嗯！', '喵呜～']
}

const pickOne = <T>(items: T[], rng: Rng) => items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
const chaseDelay = (rng: Rng) => 60 + rng() * 60
const platformOf = (pet: PetState) => pet.surface.kind === 'platform' ? pet.surface.id : null
const findPlatform = (terrain: Terrain, id: string | null) => id === null ? undefined : terrain.platforms.find(item => item.id === id)
const facingToward = (pet: PetState, x: number) => ({ ...pet, facing: x < pet.x ? 'left' as const : 'right' as const })

export function createSocial(rng: Rng): SocialState {
	return { chase: null, nextChaseIn: chaseDelay(rng), greetCooldown: 8, stackCooldown: 20, checkIn: CHECK_INTERVAL }
}

/** Standing on an ordinary platform with nothing better to do. */
export function isFree(pet: PetState) {
	const platform = platformOf(pet)
	return platform !== null && !isPetPlatform(platform) && ['idle', 'walk', 'run'].includes(pet.pose) && pet.goalId === null && pet.flight === null
}

export function socialStep(pets: PetState[], social: SocialState, dt: number, terrain: Terrain, input: SocialInput, rng: Rng): { pets: PetState[]; social: SocialState; speech: SocialSpeech[] } {
	const speech: SocialSpeech[] = []
	const next: SocialState = {
		...social,
		chase: social.chase && { ...social.chase, time: social.chase.time + dt },
		nextChaseIn: social.nextChaseIn - dt,
		greetCooldown: Math.max(0, social.greetCooldown - dt),
		stackCooldown: Math.max(0, social.stackCooldown - dt),
		checkIn: social.checkIn - dt
	}
	if (pets.length < 2 || input.sleepy || input.reducedMotion) return { pets, social: { ...next, chase: null }, speech }
	if (next.checkIn > 0) return { pets, social: next, speech }
	next.checkIn = CHECK_INTERVAL

	let [a, b] = pets
	const rest = pets.slice(2)
	const samePlatform = platformOf(a) !== null && platformOf(a) === platformOf(b)
	const distance = Math.abs(a.x - b.x)

	if (next.chase) {
		const chaserIsA = next.chase.chaserId === a.id
		let chaser = chaserIsA ? a : b
		let target = chaserIsA ? b : a
		if (next.chase.time > CHASE_TIMEOUT) {
			next.chase = null
			next.nextChaseIn = chaseDelay(rng)
		} else if (samePlatform && distance < CATCH_DISTANCE) {
			chaser = cheer(chaser)
			target = cheer(target)
			speech.push({ petId: chaser.id, text: '抓到啦！', delayMs: 0 })
			next.chase = null
			next.nextChaseIn = chaseDelay(rng)
		} else {
			const platform = findPlatform(terrain, platformOf(target))
			if (isFree(chaser) && platform && !isPetPlatform(platform.id)) {
				chaser = samePlatform ? runTo(chaser, target.x, platform) : setGoal(chaser, platform.id)
			}
			if (isFree(target) && samePlatform && distance < FLEE_DISTANCE && platform) target = flee(target, chaser, platform, terrain, rng)
		}
		;[a, b] = chaserIsA ? [chaser, target] : [target, chaser]
		return { pets: [a, b, ...rest], social: next, speech }
	}

	const bothFree = isFree(a) && isFree(b)
	if (bothFree && samePlatform && distance < GREET_DISTANCE && next.greetCooldown <= 0) {
		a = facingToward(cheer(a), b.x)
		b = facingToward(cheer(b), a.x)
		speech.push({ petId: a.id, text: pickOne(GREETINGS[a.id] ?? ['你好呀'], rng), delayMs: 0 })
		speech.push({ petId: b.id, text: pickOne(GREETINGS[b.id] ?? ['你好呀'], rng), delayMs: REPLY_DELAY_MS })
		next.greetCooldown = GREET_COOLDOWN
		return { pets: [a, b, ...rest], social: next, speech }
	}

	if (bothFree && samePlatform && distance < STACK_DISTANCE && next.stackCooldown <= 0 && rng() < STACK_CHANCE) {
		const riderIsA = rng() < 0.5
		const rider = riderIsA ? a : b
		const carrier = holdStill(riderIsA ? b : a, STACK_WAIT)
		const head = headPlatform(carrier)
		const jump = head && travelToPlatform(rider, head, carrier.x, withPeerHeads(terrain, [rider, carrier], rider))
		if (jump && jump.pose === 'crouch') {
			;[a, b] = riderIsA ? [jump, carrier] : [carrier, jump]
			speech.push({ petId: rider.id, text: '嘿咻！', delayMs: 0 })
			next.stackCooldown = STACK_COOLDOWN
			return { pets: [a, b, ...rest], social: next, speech }
		}
	}

	if (bothFree && next.nextChaseIn <= 0) {
		const chaserIsA = rng() < 0.5
		const chaser = chaserIsA ? a : b
		let target = chaserIsA ? b : a
		const platform = findPlatform(terrain, platformOf(target))
		if (platform) target = flee(target, chaser, platform, terrain, rng)
		;[a, b] = chaserIsA ? [chaser, target] : [target, chaser]
		next.chase = { chaserId: chaser.id, targetId: target.id, time: 0 }
		speech.push({ petId: chaser.id, text: '等等我！', delayMs: 0 })
		speech.push({ petId: target.id, text: '抓不到～', delayMs: TAUNT_DELAY_MS })
	}
	return { pets: [a, b, ...rest], social: next, speech }
}

/** Run to the far end of the platform, or leave for another one (flying if it can). */
function flee(target: PetState, chaser: PetState, platform: Platform, terrain: Terrain, rng: Rng): PetState {
	if (rng() < 0.5) return runTo(target, chaser.x < target.x ? platform.x2 : platform.x1, platform)
	const others = terrain.platforms.filter(item => item.id !== platform.id && !isPetPlatform(item.id) && item.id !== FLOOR_ID)
	if (!others.length) return runTo(target, chaser.x < target.x ? platform.x2 : platform.x1, platform)
	const destination = pickOne(others, rng)
	if (!target.species.canFly) return setGoal(target, destination.id)
	return travelToPlatform(target, destination, (destination.x1 + destination.x2) / 2, terrain, true) ?? target
}
