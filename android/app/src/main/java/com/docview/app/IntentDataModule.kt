package com.docview.app

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

    /**
     * Read the current activity's intent data (URI, action, MIME type).
     * Returns a map with { uri, action, type } or null if no data is present.
     */
    @ReactMethod
    fun getIntentData(promise: Promise) {
        try {
            val activity = currentActivity
            if (activity == null) {
                Log.w(TAG, "getIntentData: currentActivity is NULL")
                promise.resolve(null)
                return
            }

            val intent = activity.intent
            if (intent == null) {
                Log.w(TAG, "getIntentData: intent is NULL")
                promise.resolve(null)
                return
            }

            val action = intent.action
            val data = intent.data
            val type = intent.type
            val categories = intent.categories
            val extras = intent.extras

            Log.d(TAG, "========== INTENT DUMP ==========")
            Log.d(TAG, "  action     = $action")
            Log.d(TAG, "  data       = $data")
            Log.d(TAG, "  type       = $type")
            Log.d(TAG, "  categories = $categories")
            Log.d(TAG, "  flags      = 0x${Integer.toHexString(intent.flags)}")
            if (extras != null) {
                for (key in extras.keySet()) {
                    Log.d(TAG, "  extra[$key] = ${extras.get(key)}")
                }
            } else {
                Log.d(TAG, "  extras     = (none)")
            }
            Log.d(TAG, "==================================")

            // Handle ACTION_VIEW — file opened via "Open with"
            if (action == Intent.ACTION_VIEW && data != null) {
                Log.i(TAG, "✅ ACTION_VIEW detected! URI=$data, type=$type")
                val map = WritableNativeMap()
                map.putString("uri", data.toString())
                map.putString("action", action)
                map.putString("type", type ?: "")
                promise.resolve(map)
                return
            }

            // Handle ACTION_SEND — file shared to this app (fallback, share-intent usually handles this)
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
            Log.e(TAG, "getIntentData EXCEPTION: ${e.message}", e)
            promise.resolve(null)
        }
    }

    /**
     * Clear the intent data after handling to prevent re-processing on re-render.
     */
    @ReactMethod
    fun clearIntentData() {
        try {
            val activity = currentActivity ?: return
            val intent = activity.intent ?: return
            Log.d(TAG, "clearIntentData: clearing intent data (was action=${intent.action}, data=${intent.data})")
            // Remove the data URI and reset action to MAIN so it won't be re-processed
            intent.data = null
            intent.action = Intent.ACTION_MAIN
        } catch (e: Exception) {
            Log.e(TAG, "clearIntentData EXCEPTION: ${e.message}", e)
        }
    }
}
