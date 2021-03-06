import * as ts from 'typescript';
import * as path from 'path';
import { AppEnv } from '@travetto/base/src/env';
import { TransformUtil, State } from '@travetto/compiler';

const stringHash = require('string-hash');

interface IState extends State {
  file: string;
  fullFile: string;
  imported?: ts.Identifier;
}

function createStaticField(name: string, val: ts.Expression | string | number) {
  return ts.createProperty(
    undefined,
    [ts.createToken(ts.SyntaxKind.StaticKeyword)],
    name, undefined, undefined, ['string', 'number'].includes(typeof val) ? ts.createLiteral(val as any) : val as ts.Expression
  );
}

const registerPath = require.resolve('../src/decorator/register');

function visitNode<T extends ts.Node>(context: ts.TransformationContext, node: T, state: IState): T {
  if (state.path === registerPath) { // Cannot process self
    return node;
  }

  if (ts.isClassDeclaration(node) && node.name && node.parent && ts.isSourceFile(node.parent)) {
    if (!state.imported) {
      state.imported = ts.createIdentifier(`import_Register`);
      state.newImports.push({
        ident: state.imported,
        path: registerPath
      });
    }

    const hashes: any = {};

    for (const child of node.members) {
      if (ts.isMethodDeclaration(child)) {
        const hash = stringHash(child.getText());
        hashes[child.name.getText()] = ts.createLiteral(hash);
      }
    }

    const ret = ts.updateClassDeclaration(node,
      ts.createNodeArray(
        [ts.createDecorator(
          ts.createCall(ts.createPropertyAccess(state.imported, ts.createIdentifier('Register')), undefined, [])
        ), ...(node.decorators || [])]),
      node.modifiers,
      node.name,
      node.typeParameters,
      ts.createNodeArray(node.heritageClauses),
      ts.createNodeArray([
        createStaticField('__filename', state.fullFile.replace(/[\\\/]/g, path.sep)),
        createStaticField('__id', `${state.file}#${node.name!.getText()}`),
        createStaticField('__hash', stringHash(node.getText())),
        createStaticField('__methodHashes', TransformUtil.extendObjectLiteral(hashes)),
        ...node.members
      ])
    ) as any;

    ret.parent = node.parent;

    for (const el of ret.members) {
      if (!el.parent) {
        el.parent = ret;
      }
    }

    return ret;
  }
  return ts.visitEachChild(node, c => visitNode(context, c, state), context);
}

export const ClassIdTransformer = {
  transformer: TransformUtil.importingVisitor<IState>((file: ts.SourceFile) => {
    let fileRoot = file.fileName.replace(/[\\\/]/g, path.sep);

    let ns = '@sys';

    if (fileRoot.includes(AppEnv.cwd)) {
      fileRoot = fileRoot.split(AppEnv.cwd)[1].replace(/^[\\\/]+/, '');
      ns = '@app';
      if (fileRoot.startsWith('node_modules')) {
        fileRoot = fileRoot.split('node_modules').pop()!.replace(/^[\\\/]+/, '');
        if (fileRoot.startsWith('@')) {
          const [ns1, ns2, ...rest] = fileRoot.split(/[\\\/]/);
          ns = `${ns1}.${ns2}`;
          fileRoot = rest.join('.');
        }
      }
    }

    fileRoot = fileRoot
      .replace(/[\\\/]+/g, '.')
      .replace(/^\./, '')
      .replace(/\.(t|j)s$/, '');

    return { file: `${ns}:${fileRoot}`, fullFile: file.fileName, newImports: [], imports: new Map() };
  }, visitNode),
  phase: 'before',
  priority: 0
};