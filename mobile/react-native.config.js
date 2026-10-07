const path = require('path');

/**
 * react-native-config 1.7.x usa BaseReactPackage; o CLI 15 so detecta
 * ReactPackage/TurboReactPackage e acaba com platforms.android = null.
 * Forcamos o autolink completo (incl. codegen New Arch).
 */
const configAndroid = path.join(
  __dirname,
  'node_modules',
  'react-native-config',
  'android',
);

module.exports = {
  dependencies: {
    'react-native-config': {
      platforms: {
        android: {
          sourceDir: configAndroid,
          packageImportPath: 'import com.lugg.RNCConfig.RNCConfigPackage;',
          packageInstance: 'new RNCConfigPackage()',
          libraryName: 'RNCConfigSpec',
          componentDescriptors: [],
          cmakeListsPath: path
            .join(
              configAndroid,
              'build',
              'generated',
              'source',
              'codegen',
              'jni',
              'CMakeLists.txt',
            )
            .replace(/\\/g, '/'),
        },
      },
    },
  },
};
