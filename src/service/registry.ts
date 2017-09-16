import { Class } from '../model/types';
import { ClassSource, ChangeEvent } from './class-source';
import { EventEmitter } from 'events';

export abstract class Registry implements ClassSource {

  protected resolved: boolean;;
  protected initialized: Promise<any>;
  protected events = new EventEmitter();
  protected descendents: Registry[] = [];

  constructor(protected parent?: ClassSource) {
    if (parent) {
      this.listen(parent);
      if (parent instanceof Registry) {
        parent.descendents.push(this);
      }
    }
  }

  initialInstall(): any {
    return;
  }

  async init(): Promise<any> {
    if (!this.initialized) {
      this.initialized = this._init();
    }
    return this.initialized;
  }

  protected async _init(): Promise<any> {
    try {
      this.resolved = false;

      if (this.parent && !(this.parent instanceof Registry)) {
        await this.parent.init();
      }

      let classes = await this.initialInstall();
      if (classes) {
        for (let cls of classes) {
          this.install(cls, { type: 'init', curr: cls });
        }
      }

      await Promise.all(this.descendents.map(x => x.init()));

      console.log('Initialized', this.constructor.__id);
    } catch (e) {
      console.log(e);
      throw e;
    } finally {
      this.resolved = true;
    }
  }

  onInstall(cls: Class, e: ChangeEvent): void {

  }

  onUninstall(cls: Class, e: ChangeEvent): void {

  }

  uninstall(classes: Class | Class[], e: ChangeEvent) {
    if (!Array.isArray(classes)) {
      classes = [classes];
    }
    for (let cls of classes) {
      this.onUninstall(cls, e);
    }
  }

  install(classes: Class | Class[], e: ChangeEvent) {
    if (!Array.isArray(classes)) {
      classes = [classes];
    }
    for (let cls of classes) {
      this.onInstall(cls, e);
    }
  }


  onEvent(event: ChangeEvent) {
    console.debug('Received', this.constructor.__id, event.type, (event.curr || event.prev)!.__id);

    switch (event.type) {
      case 'removing':
        this.uninstall(event.prev!, event);
        break;
      case 'init':
      case 'added':
        this.install(event.curr!, event);
        break;
      case 'changed':
        this.uninstall(event.prev!, event);
        this.install(event.curr!, event);
        break;
      default:
        return;
    }
  }

  emit(e: ChangeEvent) {
    this.events.emit('change', e);
  }

  on<T>(callback: (e: ChangeEvent) => any): void {
    this.events.on('change', callback);
  }

  listen(source: ClassSource) {
    source.on(this.onEvent.bind(this));
  }
}