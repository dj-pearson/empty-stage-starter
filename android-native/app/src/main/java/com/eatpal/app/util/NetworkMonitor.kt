package com.eatpal.app.util

import android.annotation.SuppressLint
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.eatpal.app.data.remote.OfflineStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Kotlin port of iOS `NetworkMonitor.swift`. Publishes connectivity state and
 * auto-flushes the offline queue the moment the network returns — same trigger
 * the iOS app uses to drain pending mutations on reconnect.
 */
@Singleton
class NetworkMonitor @Inject constructor(
    @ApplicationContext private val context: Context,
    private val offlineStore: OfflineStore,
) {
    enum class ConnectionType { WIFI, CELLULAR, WIRED, UNKNOWN }

    private val _isConnected = MutableStateFlow(true)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _connectionType = MutableStateFlow(ConnectionType.UNKNOWN)
    val connectionType: StateFlow<ConnectionType> = _connectionType.asStateFlow()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val manager = context.getSystemService(ConnectivityManager::class.java)

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            val wasConnected = _isConnected.value
            _isConnected.value = true
            if (!wasConnected) {
                // US-150 parity: drain the offline queue on reconnect.
                scope.launch { offlineStore.syncPendingMutations() }
            }
        }

        override fun onLost(network: Network) {
            _isConnected.value = false
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            _connectionType.value = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> ConnectionType.WIFI
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> ConnectionType.CELLULAR
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> ConnectionType.WIRED
                else -> ConnectionType.UNKNOWN
            }
        }
    }

    @SuppressLint("MissingPermission")
    fun start() {
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            .build()
        manager.registerNetworkCallback(request, callback)
    }

    fun stop() {
        runCatching { manager.unregisterNetworkCallback(callback) }
    }

    /**
     * Classifies an [Exception] as connectivity-related so callers can choose
     * to keep the optimistic update and queue the mutation for later replay.
     * Mirrors the iOS `isNetworkError` predicate on URLError codes.
     */
    fun isNetworkError(t: Throwable): Boolean {
        val name = t::class.qualifiedName.orEmpty()
        val msg = t.message.orEmpty().lowercase()
        return name.contains("IOException", ignoreCase = true) ||
            name.contains("ConnectException", ignoreCase = true) ||
            name.contains("UnknownHostException", ignoreCase = true) ||
            name.contains("SocketTimeoutException", ignoreCase = true) ||
            msg.contains("unable to resolve host") ||
            msg.contains("failed to connect") ||
            msg.contains("timeout")
    }
}
