const {
  withDangerousMod,
  withMainActivity,
  withMainApplication,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const intentDataModuleCode = `package com.docview.app

import android.content.Intent
import android.util.Log
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class IntentDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "DocView.IntentModule"
    }

    override fun getName(): String = "IntentDataModule"

    @ReactMethod
    fun getIntentData(promise: Promise) {
        try {
            val activity = getCurrentActivity()
            if (activity == null) {
                Log.w(TAG, "getIntentData: currentActivity is NULL")
                promise.resolve(null)
                return
            }

            val intent = activity.getIntent()
            if (intent == null) {
                Log.w(TAG, "getIntentData: intent is NULL")
                promise.resolve(null)
                return
            }

            val action = intent.getAction()
            val data = intent.getData()
            val type = intent.getType()
            val categories = intent.getCategories()
            val extras = intent.getExtras()

            Log.d(TAG, "========== INTENT DUMP ==========")
            Log.d(TAG, "  action     = $action")
            Log.d(TAG, "  data       = $data")
            Log.d(TAG, "  type       = $type")
            Log.d(TAG, "  categories = $categories")
            Log.d(TAG, "  flags      = 0x\${Integer.toHexString(intent.getFlags())}")
            if (extras != null) {
                for (key in extras.keySet()) {
                    Log.d(TAG, "  extra[$key] = \${extras.get(key)}")
                }
            } else {
                Log.d(TAG, "  extras     = (none)")
            }
            Log.d(TAG, "==================================")

            if (action == Intent.ACTION_VIEW && data != null) {
                Log.i(TAG, "✅ ACTION_VIEW detected! URI=$data, type=$type")
                val map = WritableNativeMap()
                map.putString("uri", data.toString())
                map.putString("action", action)
                map.putString("type", type ?: "")
                promise.resolve(map)
                return
            }

            if (action == Intent.ACTION_SEND) {
                val extraStream = intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)
                Log.i(TAG, "ACTION_SEND detected! EXTRA_STREAM=$extraStream, type=$type")
                if (extraStream != null) {
                    Log.i(TAG, "✅ ACTION_SEND with file URI=$extraStream")
                    val map = WritableNativeMap()
                    map.putString("uri", extraStream.toString())
                    map.putString("action", action)
                    map.putString("type", type ?: "")
                    promise.resolve(map)
                    return
                } else {
                    Log.w(TAG, "ACTION_SEND but EXTRA_STREAM is null")
                }
            }

            Log.d(TAG, "❌ No file data found in intent (action=$action)")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(TAG, "getIntentData EXCEPTION: \${e.message}", e)
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun clearIntentData() {
        try {
            val activity = getCurrentActivity() ?: return
            val intent = activity.getIntent() ?: return
            Log.d(TAG, "clearIntentData: clearing intent data (was action=\${intent.getAction()}, data=\${intent.getData()})")
            intent.setData(null)
            intent.setAction(Intent.ACTION_MAIN)
        } catch (e: Exception) {
            Log.e(TAG, "clearIntentData EXCEPTION: \${e.message}", e)
        }
    }
}
`;

const intentDataPackageCode = `package com.docview.app

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class IntentDataPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(IntentDataModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
`;

const withNativeFiles = (config) => {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android?.package || 'com.docview.app';
      const packagePath = packageName.replace(/\./g, '/');
      const destDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath
      );

      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(path.join(destDir, 'IntentDataModule.kt'), intentDataModuleCode);
      fs.writeFileSync(path.join(destDir, 'IntentDataPackage.kt'), intentDataPackageCode);

      return config;
    },
  ]);
};

const withCustomMainActivity = (config) => {
  return withMainActivity(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('import android.content.Intent')) {
      contents = contents.replace(
        'import android.os.Bundle',
        'import android.content.Intent\nimport android.os.Bundle\nimport android.util.Log'
      );
    }

    const onCreateLogging = `
    val launchIntent = getIntent()
    Log.i("DocView.MainActivity", "======= onCreate =======")
    Log.i("DocView.MainActivity", "  action     = \${launchIntent?.action}")
    Log.i("DocView.MainActivity", "  data       = \${launchIntent?.data}")
    Log.i("DocView.MainActivity", "  type       = \${launchIntent?.type}")
    Log.i("DocView.MainActivity", "  categories = \${launchIntent?.categories}")
    Log.i("DocView.MainActivity", "  flags      = 0x\${Integer.toHexString(launchIntent?.flags ?: 0)}")
    if (launchIntent?.extras != null) {
      for (key in launchIntent.extras!!.keySet()) {
        Log.i("DocView.MainActivity", "  extra[$key] = \${launchIntent.extras!!.get(key)}")
      }
    }
    Log.i("DocView.MainActivity", "========================")
`;

    if (!contents.includes('======= onCreate =======') && contents.includes('super.onCreate(null)')) {
      contents = contents.replace(
        'super.onCreate(null)',
        'super.onCreate(null)\n' + onCreateLogging
      );
    }

    const onNewIntentCode = `
  override fun onNewIntent(intent: Intent) {
    Log.i("DocView.MainActivity", "======= onNewIntent =======")
    Log.i("DocView.MainActivity", "  action     = \${intent.action}")
    Log.i("DocView.MainActivity", "  data       = \${intent.data}")
    Log.i("DocView.MainActivity", "  type       = \${intent.type}")
    Log.i("DocView.MainActivity", "  categories = \${intent.categories}")
    if (intent.extras != null) {
      for (key in intent.extras!!.keySet()) {
        Log.i("DocView.MainActivity", "  extra[$key] = \${intent.extras!!.get(key)}")
      }
    }
    Log.i("DocView.MainActivity", "============================")

    super.onNewIntent(intent)
    setIntent(intent)
  }
`;
    if (!contents.includes('fun onNewIntent')) {
      contents = contents.replace(
        'class MainActivity : ReactActivity() {',
        'class MainActivity : ReactActivity() {\n' + onNewIntentCode
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

const withCustomMainApplication = (config) => {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (!contents.includes('add(IntentDataPackage())')) {
      contents = contents.replace(
        'PackageList(this).packages.apply {',
        'PackageList(this).packages.apply {\n          add(IntentDataPackage())'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = function withIntentDataModule(config) {
  config = withNativeFiles(config);
  config = withCustomMainActivity(config);
  config = withCustomMainApplication(config);
  return config;
};
