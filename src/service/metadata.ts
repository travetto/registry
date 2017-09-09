import { Registry } from './registry';
import { CompilerClassSource } from './compiler-source';
import { ChangeEvent } from './class-source';
import { Class } from '../model';
import * as _ from 'lodash';

function id(cls: string | Class) {
  return cls && typeof cls !== 'string' ? cls.__id : cls;
}

export abstract class MetadataRegistry<C extends { class: Class }, M = any> extends Registry {

  protected expired = new Map<string, C>();
  protected pending = new Map<string, Partial<C>>();
  protected pendingMethods = new Map<string, Map<Function, Partial<M>>>();
  protected entries = new Map<string, C>();

  abstract onInstallFinalize<T>(cls: Class<T>): C;

  abstract createPending(cls: Class): Partial<C>;

  has(cls: string | Class) {
    return this.entries.has(id(cls));
  }

  get(cls: string | Class): C {
    return this.entries.get(id(cls))!;
  }

  getExpired(cls: string | Class): C {
    return this.expired.get(id(cls))!;
  }

  hasExpired(cls: string | Class) {
    return this.expired.has(id(cls));
  }

  hasPending(cls: string | Class) {
    return this.pending.has(id(cls));
  }

  getClasses() {
    return Array.from(this.entries.values()).map(x => x.class);
  }

  initialInstall(): any {
    return Array.from(this.pending.values()).map(x => x.class);
  }

  createPendingMethod(cls: Class, method: Function): Partial<M> {
    return {}
  }

  getOrCreatePending(cls: Class): Partial<C> {
    let cid = id(cls);
    if (!this.hasPending(cid)) {
      this.pending.set(cid, this.createPending(cls));
      this.pendingMethods.set(cid, new Map());
    }
    return this.pending.get(cid)!;
  }

  getOrCreatePendingMethod(cls: Class, method: Function): Partial<M> {
    this.getOrCreatePending(cls);

    if (!this.pendingMethods.get(cls.__id)!.has(method)) {
      this.pendingMethods.get(cls.__id)!.set(method, this.createPendingMethod(cls, method));
    }
    return this.pendingMethods.get(cls.__id)!.get(method)!;
  }


  register(cls: Class, pconfig: Partial<C>) {
    let conf = this.getOrCreatePending(cls);
    _.merge(conf, pconfig);
  }

  registerMethod(cls: Class, method: Function, pconfig: Partial<M>) {
    let conf = this.getOrCreatePendingMethod(cls, method);
    _.merge(conf, pconfig);
  }

  async onInstall(cls: Class, e: ChangeEvent) {
    if (this.hasPending(cls) || this.pendingMethods.has(cls.__id)) {
      let result = this.onInstallFinalize(cls);
      this.pendingMethods.delete(cls.__id);
      this.pending.delete(cls.__id);

      this.entries.set(cls.__id, result);
      this.emit(e);
    }
  }

  async onUninstall(cls: Class, e: ChangeEvent) {
    if (this.has(cls)) {
      this.expired.set(cls.__id, this.get(cls)!);
      this.entries.delete(cls.__id);
      if (e.type === 'removing') {
        this.emit(e);
      }
      process.nextTick(() => this.expired.delete(cls.__id));
    }
  }
}