import { deepAssign } from '@travetto/base';

import { Registry } from './registry';
import { ChangeEvent } from '../source';
import { Class } from '../model';

function id(cls: string | Class) {
  return cls && typeof cls !== 'string' ? cls.__id : cls;
}

export abstract class MetadataRegistry<C extends { class: Class }, M = any> extends Registry {

  protected expired = new Map<string, C>();
  protected pending = new Map<string, Partial<C>>();
  protected pendingMethods = new Map<string, Map<Function, Partial<M>>>();

  protected entries = new Map<string, C>();

  abstract onInstallFinalize<T>(cls: Class<T>): C;

  onUninstallFinalize<T>(cls: Class<T>) {

  }

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
    return {};
  }

  getParentClass(cls: Class): Class | null {
    const parent = Object.getPrototypeOf(cls) as Class;
    return parent.name && (parent as any) !== Object ? parent : null;
  }

  getOrCreatePending(cls: Class): Partial<C> {
    const cid = id(cls);
    if (!this.pending.has(cid)) {
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
    const conf = this.getOrCreatePending(cls);
    deepAssign(conf, pconfig);
  }

  registerMethod(cls: Class, method: Function, pconfig: Partial<M>) {
    const conf = this.getOrCreatePendingMethod(cls, method);
    deepAssign(conf, pconfig);
  }

  onInstall(cls: Class, e: ChangeEvent<Class>) {
    if (this.pending.has(cls.__id) || this.pendingMethods.has(cls.__id)) {
      const result = this.onInstallFinalize(cls);
      this.pendingMethods.delete(cls.__id);
      this.pending.delete(cls.__id);

      this.entries.set(cls.__id, result);
      this.emit(e);
    }
  }

  onUninstall(cls: Class, e: ChangeEvent<Class>) {
    if (this.entries.has(cls.__id)) {
      this.expired.set(cls.__id, this.entries.get(cls.__id)!);
      this.entries.delete(cls.__id);
      this.onUninstallFinalize(cls);
      if (e.type === 'removing') {
        this.emit(e);
      }
      process.nextTick(() => this.expired.delete(cls.__id));
    }
  }

  onReset() {
    this.entries.clear();
    this.pending.clear();
    this.pendingMethods.clear();
    this.expired.clear();
  }
}