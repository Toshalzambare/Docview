package com.docview.app

import android.content.Intent
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.WritableNativeMap

class IntentDataModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

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
                promise.resolve(null)
                return
            }

            val intent = activity.intent
            if (intent == null) {
                promise.resolve(null)
                return
            }

            val action = intent.action
            val data = intent.data
            val type = intent.type

            // Handle ACTION_VIEW — file opened via "Open with"
            if (action == Intent.ACTION_VIEW && data != null) {
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
                if (extraStream != null) {
                    val map = WritableNativeMap()
                    map.putString("uri", extraStream.toString())
                    map.putString("action", action)
                    map.putString("type", type ?: "")
                    promise.resolve(map)
                    return
                }
            }

            promise.resolve(null)
        } catch (e: Exception) {
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
            // Remove the data URI and reset action to MAIN so it won't be re-processed
            intent.data = null
            intent.action = Intent.ACTION_MAIN
        } catch (e: Exception) {
            // Silently ignore
        }
    }
}
