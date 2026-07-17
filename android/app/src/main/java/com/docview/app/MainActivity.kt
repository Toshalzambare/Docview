package com.docview.app

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {

  companion object {
    private const val TAG = "DocView.MainActivity"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    setTheme(R.style.AppTheme);
    super.onCreate(null)

    // Log the intent that launched the activity
    val intent = getIntent()
    Log.i(TAG, "======= onCreate =======")
    Log.i(TAG, "  action     = ${intent?.action}")
    Log.i(TAG, "  data       = ${intent?.data}")
    Log.i(TAG, "  type       = ${intent?.type}")
    Log.i(TAG, "  categories = ${intent?.categories}")
    Log.i(TAG, "  flags      = 0x${Integer.toHexString(intent?.flags ?: 0)}")
    if (intent?.extras != null) {
      for (key in intent.extras!!.keySet()) {
        Log.i(TAG, "  extra[$key] = ${intent.extras!!.get(key)}")
      }
    }
    Log.i(TAG, "========================")
  }

  /**
   * Forward new intents to React Native so Linking.addEventListener('url')
   * fires when the app is already running and receives an ACTION_VIEW file intent.
   */
  override fun onNewIntent(intent: Intent) {
    Log.i(TAG, "======= onNewIntent =======")
    Log.i(TAG, "  action     = ${intent.action}")
    Log.i(TAG, "  data       = ${intent.data}")
    Log.i(TAG, "  type       = ${intent.type}")
    Log.i(TAG, "  categories = ${intent.categories}")
    if (intent.extras != null) {
      for (key in intent.extras!!.keySet()) {
        Log.i(TAG, "  extra[$key] = ${intent.extras!!.get(key)}")
      }
    }
    Log.i(TAG, "============================")

    super.onNewIntent(intent)
    setIntent(intent)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
