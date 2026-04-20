# Keep kotlinx.serialization classes — required for @Serializable models.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.eatpal.app.**$$serializer { *; }
-keepclassmembers class com.eatpal.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.eatpal.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Hilt
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager.FragmentContextWrapper { *; }

# Supabase-kt / Ktor
-keep class io.ktor.** { *; }
-keep class io.github.jan.supabase.** { *; }
