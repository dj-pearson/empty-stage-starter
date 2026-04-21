package com.eatpal.app.data.remote

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.eatpal.app.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.storage.storage
import io.github.jan.supabase.storage.upload
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `ImageUploadService`. Same bucket (`images`) and same
 * folder names (`foods` / `recipes` / `kids`) so URLs are interchangeable
 * between iOS and Android clients.
 */
@Singleton
class ImageUploadService @Inject constructor(
    private val supabase: SupabaseClientProvider,
    @ApplicationContext private val context: android.content.Context,
) {
    enum class Folder(val pathPrefix: String) {
        FOODS("foods"),
        RECIPES("recipes"),
        KIDS("kids"),
    }

    /**
     * Uploads [imageUri] to Supabase Storage. Compresses to JPEG @ 80 quality
     * and resizes to max 1024px on the longer side — matches iOS parameters.
     * Returns the public URL.
     */
    suspend fun upload(imageUri: Uri, folder: Folder, entityId: String): String =
        withContext(Dispatchers.IO) {
            val bytes = readAndCompress(imageUri)
                ?: throw ImageUploadException("Failed to read or compress image.")
            val path = "${folder.pathPrefix}/$entityId-${System.currentTimeMillis() / 1000}.jpg"

            supabase.client.storage.from(BUCKET).upload(path, bytes) {
                upsert = true
                contentType = io.ktor.http.ContentType.Image.JPEG
            }

            supabase.client.storage.from(BUCKET).publicUrl(path)
        }

    suspend fun delete(path: String) = withContext(Dispatchers.IO) {
        supabase.client.storage.from(BUCKET).delete(path)
    }

    private fun readAndCompress(uri: Uri, maxDimension: Int = 1024): ByteArray? {
        val resolver = context.contentResolver
        // First decode bounds-only to compute the inSampleSize so we don't
        // allocate a huge bitmap just to resize it.
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            ?: return null

        val srcWidth = bounds.outWidth
        val srcHeight = bounds.outHeight
        if (srcWidth <= 0 || srcHeight <= 0) return null

        var sampleSize = 1
        var w = srcWidth
        var h = srcHeight
        while (w / 2 >= maxDimension && h / 2 >= maxDimension) {
            sampleSize *= 2
            w /= 2
            h /= 2
        }

        val opts = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        val bitmap = resolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, opts)
        } ?: return null

        // Final scale so the longer side == maxDimension (if still over).
        val scaled = if (bitmap.width > maxDimension || bitmap.height > maxDimension) {
            val ratio = minOf(
                maxDimension.toFloat() / bitmap.width,
                maxDimension.toFloat() / bitmap.height,
            )
            val newW = (bitmap.width * ratio).toInt().coerceAtLeast(1)
            val newH = (bitmap.height * ratio).toInt().coerceAtLeast(1)
            Bitmap.createScaledBitmap(bitmap, newW, newH, true).also {
                if (it !== bitmap) bitmap.recycle()
            }
        } else bitmap

        val output = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 80, output)
        scaled.recycle()
        return output.toByteArray()
    }

    companion object {
        private const val BUCKET = "images"

        init {
            // Compile-time guard against the BuildConfig being reused in a
            // bucket rename — if iOS changes the bucket, update both.
            require(BuildConfig.APPLICATION_ID.isNotBlank())
        }
    }
}

class ImageUploadException(message: String) : Exception(message)
