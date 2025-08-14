/**
 * API Service for HTTP requests
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .service('ApiService', ApiService);

    ApiService.$inject = ['$http', '$q'];

    function ApiService($http, $q) {
        var service = {
            baseUrl: 'http://localhost:8000/api/v1',
            get: get,
            post: post,
            put: put,
            delete: deleteRequest
        };

        return service;

        function get(endpoint, params) {
            var config = {
                params: params || {},
                headers: getHeaders()
            };
            
            return $http.get(service.baseUrl + endpoint, config)
                .then(handleSuccess)
                .catch(handleError);
        }

        function post(endpoint, data) {
            var config = {
                headers: getHeaders()
            };
            
            return $http.post(service.baseUrl + endpoint, data, config)
                .then(handleSuccess)
                .catch(handleError);
        }

        function put(endpoint, data) {
            var config = {
                headers: getHeaders()
            };
            
            return $http.put(service.baseUrl + endpoint, data, config)
                .then(handleSuccess)
                .catch(handleError);
        }

        function deleteRequest(endpoint) {
            var config = {
                headers: getHeaders()
            };
            
            return $http.delete(service.baseUrl + endpoint, config)
                .then(handleSuccess)
                .catch(handleError);
        }

        function getHeaders() {
            var headers = {
                'Content-Type': 'application/json'
            };
            
            var token = localStorage.getItem('access_token');
            if (token) {
                headers['Authorization'] = 'Bearer ' + token;
            }
            
            return headers;
        }

        function handleSuccess(response) {
            return response.data;
        }

        function handleError(error) {
            console.error('API Error:', error);
            return $q.reject(error);
        }
    }
})();