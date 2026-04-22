package com.eatpal.app.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Table-driven test for the offline-queue trigger predicate. AppStateStore
 * calls this before deciding whether to rollback a failed mutation or
 * enqueue it for later — false positives cause silent data loss, false
 * negatives cause bad UX. Both matter.
 */
class NetworkErrorClassifierTest {

    @Test
    fun `IOException subclass matches by class name`() {
        assertTrue(NetworkErrorClassifier.isNetworkError(IOException("socket closed")))
    }

    @Test
    fun `ConnectException matches`() {
        assertTrue(NetworkErrorClassifier.isNetworkError(ConnectException("refused")))
    }

    @Test
    fun `UnknownHostException matches`() {
        assertTrue(NetworkErrorClassifier.isNetworkError(UnknownHostException("no dns")))
    }

    @Test
    fun `SocketTimeoutException matches`() {
        assertTrue(NetworkErrorClassifier.isNetworkError(SocketTimeoutException("read timed out")))
    }

    @Test
    fun `matches by message when class is generic`() {
        assertTrue(
            NetworkErrorClassifier.isNetworkError(
                RuntimeException("Unable to resolve host \"api.tryeatpal.com\"")
            )
        )
        assertTrue(
            NetworkErrorClassifier.isNetworkError(
                RuntimeException("Failed to connect to /1.2.3.4:443")
            )
        )
        assertTrue(
            NetworkErrorClassifier.isNetworkError(RuntimeException("Request timeout"))
        )
    }

    @Test
    fun `does NOT match unrelated runtime errors`() {
        assertFalse(NetworkErrorClassifier.isNetworkError(IllegalArgumentException("bad uuid")))
        assertFalse(NetworkErrorClassifier.isNetworkError(IllegalStateException("not signed in")))
        assertFalse(NetworkErrorClassifier.isNetworkError(RuntimeException("boom")))
    }

    @Test
    fun `null message on non-network error still returns false`() {
        assertFalse(NetworkErrorClassifier.isNetworkError(RuntimeException()))
    }
}
