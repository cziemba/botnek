import { describe, expect, test } from 'vitest';
import AudioQueue, { AudioRequest } from './audioQueue';

const makeRequest = (title: string): AudioRequest =>
    ({
        interaction: {} as AudioRequest['interaction'],
        track: { title } as AudioRequest['track'],
    }) as AudioRequest;

describe('AudioQueue', () => {
    test('starts empty', () => {
        const q = new AudioQueue();
        expect(q.isEmpty()).toBe(true);
        expect(q.length()).toBe(0);
        expect(q.nextRequest()).toBeUndefined();
    });

    test('enqueue grows the queue', () => {
        const q = new AudioQueue();
        q.enqueue(makeRequest('a'));
        q.enqueue(makeRequest('b'));
        expect(q.length()).toBe(2);
        expect(q.isEmpty()).toBe(false);
    });

    test('FIFO order on dequeue', () => {
        const q = new AudioQueue();
        ['a', 'b', 'c'].forEach((t) => q.enqueue(makeRequest(t)));
        expect(q.nextRequest()?.track.title).toBe('a');
        expect(q.nextRequest()?.track.title).toBe('b');
        expect(q.nextRequest()?.track.title).toBe('c');
        expect(q.nextRequest()).toBeUndefined();
    });

    test('clear empties the queue', () => {
        const q = new AudioQueue();
        ['a', 'b', 'c'].forEach((t) => q.enqueue(makeRequest(t)));
        q.clear();
        expect(q.isEmpty()).toBe(true);
        expect(q.length()).toBe(0);
        expect(q.nextRequest()).toBeUndefined();
    });

    test('length tracks dequeues', () => {
        const q = new AudioQueue();
        q.enqueue(makeRequest('a'));
        q.enqueue(makeRequest('b'));
        expect(q.length()).toBe(2);
        q.nextRequest();
        expect(q.length()).toBe(1);
        q.nextRequest();
        expect(q.length()).toBe(0);
        expect(q.isEmpty()).toBe(true);
    });

    test('nextRequest on empty does not throw', () => {
        const q = new AudioQueue();
        expect(() => q.nextRequest()).not.toThrow();
        expect(q.nextRequest()).toBeUndefined();
    });

    test('queue array is the same instance — exposed for inspection', () => {
        const q = new AudioQueue();
        q.enqueue(makeRequest('a'));
        expect(q.queue).toHaveLength(1);
        expect(q.queue[0].track.title).toBe('a');
    });
});
