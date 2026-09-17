import { TypedEmitter } from '../src/utils/emitter';

interface Events {
  ping: { value: number };
  pong: undefined;
}

describe('TypedEmitter', () => {
  it('delivers payloads to every listener', () => {
    const emitter = new TypedEmitter<Events>();
    const first = jest.fn();
    const second = jest.fn();

    emitter.on('ping', first);
    emitter.on('ping', second);
    emitter.emit('ping', { value: 1 });

    expect(first).toHaveBeenCalledWith({ value: 1 });
    expect(second).toHaveBeenCalledWith({ value: 1 });
  });

  it('stops delivering after the returned unsubscribe is called', () => {
    const emitter = new TypedEmitter<Events>();
    const listener = jest.fn();

    const unsubscribe = emitter.on('ping', listener);
    unsubscribe();
    emitter.emit('ping', { value: 1 });

    expect(listener).not.toHaveBeenCalled();
  });

  it('fires a once listener exactly one time', () => {
    const emitter = new TypedEmitter<Events>();
    const listener = jest.fn();

    emitter.once('ping', listener);
    emitter.emit('ping', { value: 1 });
    emitter.emit('ping', { value: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it('lets a listener unsubscribe itself mid-emit without skipping others', () => {
    const emitter = new TypedEmitter<Events>();
    const second = jest.fn();

    const unsubscribe = emitter.on('ping', () => unsubscribe());
    emitter.on('ping', second);
    emitter.emit('ping', { value: 1 });

    expect(second).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from the rest', () => {
    const emitter = new TypedEmitter<Events>();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const healthy = jest.fn();

    emitter.on('ping', () => {
      throw new Error('listener blew up');
    });
    emitter.on('ping', healthy);

    expect(() => emitter.emit('ping', { value: 1 })).not.toThrow();
    expect(healthy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
