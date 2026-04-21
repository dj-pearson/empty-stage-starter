package com.eatpal.app.ui.share

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import com.eatpal.app.MainActivity
import com.eatpal.app.data.local.PendingRecipeImportStore
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Receives ACTION_SEND with text/plain. Extracts the first URL, enqueues a
 * pending recipe import, and bounces back to MainActivity. On next sign-in
 * (or if already signed in) AppStateStore.drainPendingRecipeImports inserts
 * them as recipes with source_type='share_extension' — iOS parity.
 */
@AndroidEntryPoint
class ShareReceiverActivity : ComponentActivity() {

    @Inject lateinit var queue: PendingRecipeImportStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val shared = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
        val url = URL_REGEX.find(shared)?.value

        if (url == null) {
            Toast.makeText(this, "No URL in shared content.", Toast.LENGTH_SHORT).show()
            finishAndLaunch()
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            runCatching {
                queue.enqueue(
                    PendingRecipeImportStore.PendingImport(
                        id = UUID.randomUUID().toString(),
                        sourceUrl = url,
                        createdAt = System.currentTimeMillis(),
                    )
                )
            }
        }

        Toast.makeText(this, "Recipe queued — open EatPal to finish import.", Toast.LENGTH_SHORT).show()
        finishAndLaunch()
    }

    private fun finishAndLaunch() {
        val i = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        startActivity(i)
        finish()
    }

    companion object {
        private val URL_REGEX = Regex("""https?://\S+""")
    }
}
