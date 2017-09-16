import { Compiler } from '@encore2/compiler';
import { Class } from '../model/types';
import { bulkFind } from '@encore2/base';
import { EventEmitter } from 'events';
import { ClassSource, ChangeEvent } from './class-source';
import { PendingRegister } from '../decorator/register';

export class CompilerClassSource implements ClassSource {

  private classes = new Map<string, Map<string, Class>>();
  private events = new EventEmitter();

  emit(e: ChangeEvent) {
    this.events.emit('change', e);
  }

  async init() {
    let files = await bulkFind(Compiler.workingSets, undefined, Compiler.invalidWorkingSetFile);

    const extra: string[] = [];

    const requireListen = (file: string) => extra.push(file);

    Compiler.on('required', requireListen);

    for (let file of files) {
      this.processClasses(file, this.computeClasses(file));
    }

    for (let file of extra) {
      if (PendingRegister.has(file)) {
        this.processClasses(file, PendingRegister.get(file)!);
        PendingRegister.delete(file);
      }
    }

    Compiler.off('required', requireListen);


    Compiler.on('changed', this.watch.bind(this));
    Compiler.on('removed', this.watch.bind(this));
    Compiler.on('added', this.watch.bind(this));
    Compiler.on('required', f => this.processClasses(f, PendingRegister.get(f)!));
  }

  protected processClasses(file: string, classes?: Class[]) {
    if (!classes || !classes.length) {
      return;
    }
    this.classes.set(file, new Map());
    for (let cls of classes) {
      this.classes.get(file)!.set(cls.__id, cls);
      this.emit({ type: 'added', curr: cls });
    }
  }

  on<T>(callback: (e: ChangeEvent) => void): void {
    this.events.on('change', callback);
  }

  protected async watch(file: string) {
    console.log('Got file', file);
    let next = new Map(this.computeClasses(file).map(x => [x.__id, x] as [string, Class]));
    let prev = new Map();
    if (this.classes.has(file)) {
      prev = new Map(this.classes.get(file)!.entries());
    }

    let keys = new Set([...prev.keys(), ...next.keys()]);

    if (!this.classes.has(file)) {
      this.classes.set(file, new Map());
    }

    for (let k of keys) {
      if (!next.has(k)) {
        this.emit({ type: 'removing', prev: prev.get(k)! });
        this.classes.get(file)!.delete(k);
      } else {
        this.classes.get(file)!.set(k, next.get(k)!);
        this.emit({ type: !prev.has(k) ? 'added' : 'changed', curr: next.get(k)!, prev: prev.get(k) });
      }
    }
  }

  private computeClasses(file: string) {
    try {
      let out = require(file);
      // Get and clear after computed
      let classes: Class[] = PendingRegister.get(file)!;
      PendingRegister.delete(file);
      return classes || [];
    } catch (e) {
      return [];
    }
  }
}