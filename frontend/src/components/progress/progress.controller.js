/**
 * Progress Controller - Component-based Architecture
 */
(function() {
    'use strict';

    angular
        .module('interviewPrepApp')
        .controller('ProgressController', ProgressController);

    ProgressController.$inject = ['$location', 'AuthService', 'ApiService'];

    function ProgressController($location, AuthService, ApiService) {
        var vm = this;
        
        // Properties
        vm.user = AuthService.getCurrentUser();
        vm.loading = true;
        vm.error = '';
        vm.activeTab = 'overview';
        
        // Data
        vm.progressData = {};
        vm.sessionHistory = [];
        vm.trends = {};
        vm.achievements = [];
        
        // Methods
        vm.setActiveTab = setActiveTab;
        vm.loadProgressData = loadProgressData;
        vm.loadSessionHistory = loadSessionHistory;
        vm.loadTrends = loadTrends;
        vm.exportProgress = exportProgress;
        vm.viewSessionDetails = viewSessionDetails;
        
        // Initialize
        activate();
        
        function activate() {
            if (!vm.user) {
                $location.path('/login');
                return;
            }
            
            loadProgressData();
        }
        
        function setActiveTab(tab) {
            vm.activeTab = tab;
            
            if (tab === 'sessions' && vm.sessionHistory.length === 0) {
                loadSessionHistory();
            } else if (tab === 'trends' && Object.keys(vm.trends).length === 0) {
                loadTrends();
            }
        }
        
        function loadProgressData() {
            vm.loading = true;
            vm.error = '';
            
            // Load user statistics from interviews endpoint
            ApiService.get('/interviews/statistics')
                .then(function(response) {
                    vm.progressData = response || {};
                    
                    // Set default values if not present
                    vm.progressData.overall_score = vm.progressData.avg_score || 0;
                    vm.progressData.sessions_completed = vm.progressData.total_sessions || 0;
                    vm.progressData.improvement_rate = vm.progressData.improvement || 0;
                    vm.progressData.skill_breakdown = vm.progressData.skill_breakdown || {
                        content_quality: 0,
                        body_language: 0,
                        tone_confidence: 0
                    };
                })
                .catch(function(error) {
                    // If statistics endpoint fails, set default values
                    vm.progressData = {
                        overall_score: 0,
                        sessions_completed: 0,
                        improvement_rate: 0,
                        skill_breakdown: {
                            content_quality: 0,
                            body_language: 0,
                            tone_confidence: 0
                        }
                    };
                    console.log('Progress data not available, using defaults:', error);
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function loadSessionHistory() {
            ApiService.get('/interviews/', { limit: 20 })
                .then(function(response) {
                    vm.sessionHistory = response || [];
                })
                .catch(function(error) {
                    console.error('Session history error:', error);
                });
        }
        
        function loadTrends() {
            // For now, use mock data since analytics endpoints may not be implemented
            vm.trends = {
                weekly_scores: [65, 70, 75, 78, 82],
                improvement_areas: ['Body Language', 'Tone Confidence'],
                strengths: ['Content Quality', 'Response Time']
            };
            console.log('Using mock trends data until analytics endpoints are implemented');
        }
        
        function exportProgress() {
            vm.loading = true;
            
            ApiService.get('/users/export-data')
                .then(function(response) {
                    // Create and download file
                    var dataStr = JSON.stringify(response.data, null, 2);
                    var dataBlob = new Blob([dataStr], {type: 'application/json'});
                    var url = URL.createObjectURL(dataBlob);
                    var link = document.createElement('a');
                    link.href = url;
                    link.download = 'interview-progress-' + new Date().toISOString().split('T')[0] + '.json';
                    link.click();
                    URL.revokeObjectURL(url);
                })
                .catch(function(error) {
                    vm.error = 'Failed to export progress data.';
                })
                .finally(function() {
                    vm.loading = false;
                });
        }
        
        function viewSessionDetails(sessionId) {
            $location.path('/session/' + sessionId);
        }
        
        // Helper methods
        vm.getScoreColor = function(score) {
            if (score >= 80) return 'success';
            if (score >= 60) return 'warning';
            return 'danger';
        };
        
        vm.getScoreIcon = function(score) {
            if (score >= 80) return 'fas fa-star';
            if (score >= 60) return 'fas fa-thumbs-up';
            return 'fas fa-arrow-up';
        };
        
        vm.formatDate = function(dateString) {
            if (!dateString) return 'N/A';
            return new Date(dateString).toLocaleDateString();
        };
        
        vm.getSessionTypeIcon = function(type) {
            switch (type) {
                case 'hr': return 'fas fa-users';
                case 'technical': return 'fas fa-code';
                case 'mixed': return 'fas fa-layer-group';
                default: return 'fas fa-question-circle';
            }
        };
        
        vm.getImprovementTrend = function(rate) {
            if (rate > 0) return 'text-success';
            if (rate < 0) return 'text-danger';
            return 'text-muted';
        };
        
        vm.getImprovementIcon = function(rate) {
            if (rate > 0) return 'fas fa-arrow-up';
            if (rate < 0) return 'fas fa-arrow-down';
            return 'fas fa-minus';
        };
    }
})();